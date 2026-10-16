// cg-tls-helper — Clear Glass's TLS layer: a Firefox persona is Firefox in its TLS handshake too.
// UUID: cg-tls-helper-v1-0000-2026-1016-jamesbrooks-001
// Map: docs/2026-10-16-tls-layer-phasemap.spec
//
// James, 2026-10-16: "fix it. i don't want the trouble again" — about the Node proxy (clear-glass/src/tls/proxy.js),
// which wrapped the browser's own TLS in a second TLS connection and so could not carry any HTTPS site.
//
// What it is: an HTTP CONNECT proxy on loopback that intercepts locally. For each tunnel:
//  1. read the browser's ClientHello: the server name and the ALPN protocols it offers;
//  2. dial the site with a Firefox ClientHello (uTLS: Firefox's ciphers, extensions, groups — plus X25519MLKEM768, which
//     Firefox sends by default since 132), offering only the protocols the browser offered, in Firefox's order, and
//     VERIFY the site's certificate against the system roots;
//  3. finish the browser's handshake with a certificate for that host from a local CA (only the Clear Glass sessions
//     that use this layer trust it — src/contexts/manager.js), offering exactly the protocol the site chose;
//  4. relay the decrypted bytes both ways. Nothing is parsed, so h2, http/1.1, WebSockets and streams all pass.
//
// Never the reason a site fails: a Firefox handshake the site refuses is retried with Go's standard TLS (verified, a
// different fingerprint), and logged. A certificate the site cannot prove is never retried: that connection is refused.
//
// Usage: cg-tls-helper -listen 127.0.0.1:7703 -ca-dir <dir> [-upstream-ca <pem>]
// On start it prints one JSON line to stdout: {"ready":true,"port":…,"caFingerprint":…,"caPath":…}.
package main

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"math/big"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	utls "github.com/refraction-networking/utls"
)

const version = "1.0.0"

// ── the local CA ─────────────────────────────────────────────────────────────────────────────────────────────────────

type authority struct {
	cert    *x509.Certificate
	key     *ecdsa.PrivateKey
	certPEM []byte
	leafKey *ecdsa.PrivateKey
	mu      sync.Mutex
	leaves  map[string]*tls.Certificate
}

// loadOrCreateCA keeps the CA in dir (ca.pem, ca-key.pem 0600). Made once; the same CA across restarts, so the
// sessions' trust does not change under them.
func loadOrCreateCA(dir string) (*authority, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	certPath, keyPath := filepath.Join(dir, "ca.pem"), filepath.Join(dir, "ca-key.pem")
	certPEM, err1 := os.ReadFile(certPath)
	keyPEM, err2 := os.ReadFile(keyPath)
	if err1 != nil || err2 != nil {
		key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
		if err != nil {
			return nil, err
		}
		serial, _ := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 120))
		tmpl := &x509.Certificate{
			SerialNumber:          serial,
			Subject:               pkix.Name{CommonName: "Clear Glass local TLS layer", Organization: []string{"Nexus (local only)"}},
			NotBefore:             time.Now().Add(-time.Hour),
			NotAfter:              time.Now().AddDate(10, 0, 0),
			KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign | x509.KeyUsageDigitalSignature,
			BasicConstraintsValid: true,
			IsCA:                  true,
			MaxPathLenZero:        true,
		}
		der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
		if err != nil {
			return nil, err
		}
		kder, err := x509.MarshalECPrivateKey(key)
		if err != nil {
			return nil, err
		}
		certPEM = pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
		keyPEM = pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: kder})
		if err := os.WriteFile(keyPath, keyPEM, 0o600); err != nil {
			return nil, err
		}
		if err := os.WriteFile(certPath, certPEM, 0o644); err != nil {
			return nil, err
		}
	}
	cb, _ := pem.Decode(certPEM)
	kb, _ := pem.Decode(keyPEM)
	if cb == nil || kb == nil {
		return nil, errors.New("the CA files in " + dir + " are not PEM")
	}
	cert, err := x509.ParseCertificate(cb.Bytes)
	if err != nil {
		return nil, err
	}
	key, err := x509.ParseECPrivateKey(kb.Bytes)
	if err != nil {
		return nil, err
	}
	leafKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, err
	}
	return &authority{cert: cert, key: key, certPEM: certPEM, leafKey: leafKey, leaves: map[string]*tls.Certificate{}}, nil
}

func (a *authority) fingerprint() string {
	s := sha256.Sum256(a.cert.Raw)
	return hex.EncodeToString(s[:])
}

// leafFor mints (once per host per run) a 30-day certificate for host, signed by the CA.
func (a *authority) leafFor(host string) (*tls.Certificate, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if c, ok := a.leaves[host]; ok && time.Now().Before(c.Leaf.NotAfter.Add(-time.Hour)) {
		return c, nil
	}
	serial, _ := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 120))
	tmpl := &x509.Certificate{
		SerialNumber: serial,
		Subject:      pkix.Name{CommonName: host},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().AddDate(0, 0, 30),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
	}
	if ip := net.ParseIP(host); ip != nil {
		tmpl.IPAddresses = []net.IP{ip}
	} else {
		tmpl.DNSNames = []string{host}
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, a.cert, &a.leafKey.PublicKey, a.key)
	if err != nil {
		return nil, err
	}
	leaf, _ := x509.ParseCertificate(der)
	c := &tls.Certificate{Certificate: [][]byte{der, a.cert.Raw}, PrivateKey: a.leafKey, Leaf: leaf}
	a.leaves[host] = c
	return c, nil
}

// ── the upstream: a Firefox ClientHello, verified ────────────────────────────────────────────────────────────────────

var (
	roots            *x509.CertPool // nil: the system roots
	forceFirefoxFail atomic.Bool    // tests only: make the Firefox handshake fail, to prove the standard-TLS retry
	stats            struct{ tunnels, firefox, fallback, refused atomic.Int64 }
)

// firefoxSpec — uTLS's Firefox 120 ClientHello, with X25519MLKEM768 first in the groups and key shares (Firefox's
// default since 132), and ALPN cut to what the browser offered (in Firefox's order).
func firefoxSpec(protos []string) (*utls.ClientHelloSpec, error) {
	spec, err := utls.UTLSIdToSpec(utls.HelloFirefox_120)
	if err != nil {
		return nil, err
	}
	for _, ext := range spec.Extensions {
		switch e := ext.(type) {
		case *utls.ALPNExtension:
			e.AlpnProtocols = protos
		case *utls.SupportedCurvesExtension:
			e.Curves = append([]utls.CurveID{utls.X25519MLKEM768}, e.Curves...)
		case *utls.KeyShareExtension:
			e.KeyShares = append([]utls.KeyShare{{Group: utls.X25519MLKEM768}}, e.KeyShares...)
		}
	}
	return &spec, nil
}

// offered — the browser's ALPN, kept to what we relay, in Firefox's order; none offered → http/1.1 (what TLS without
// ALPN means)
func offered(browser []string) []string {
	out := []string{}
	for _, p := range []string{"h2", "http/1.1"} {
		for _, b := range browser {
			if b == p {
				out = append(out, p)
			}
		}
	}
	if len(out) == 0 {
		out = []string{"http/1.1"}
	}
	return out
}

func isCertError(err error) bool {
	var u x509.UnknownAuthorityError
	var h x509.HostnameError
	var c x509.CertificateInvalidError
	var v *tls.CertificateVerificationError
	var uv *utls.CertificateVerificationError
	return errors.As(err, &u) || errors.As(err, &h) || errors.As(err, &c) || errors.As(err, &v) || errors.As(err, &uv)
}

// dialUpstream -> the site's verified connection and the protocol it chose
func dialUpstream(ctx context.Context, host, port string, protos []string) (net.Conn, string, error) {
	d := &net.Dialer{Timeout: 15 * time.Second, KeepAlive: 30 * time.Second}
	raw, err := d.DialContext(ctx, "tcp", net.JoinHostPort(host, port))
	if err != nil {
		return nil, "", err
	}
	spec, err := firefoxSpec(protos)
	if err == nil && !forceFirefoxFail.Load() {
		uc := utls.UClient(raw, &utls.Config{ServerName: host, RootCAs: roots, NextProtos: protos}, utls.HelloCustom)
		if err = uc.ApplyPreset(spec); err == nil {
			if err = uc.HandshakeContext(ctx); err == nil {
				stats.firefox.Add(1)
				return uc, uc.ConnectionState().NegotiatedProtocol, nil
			}
		}
		raw.Close()
		if isCertError(err) {
			stats.refused.Add(1)
			return nil, "", fmt.Errorf("the site's certificate does not hold: %w", err)
		}
		log.Printf("%s: the Firefox handshake failed (%v) — retrying with standard TLS", host, err)
		if raw, err = d.DialContext(ctx, "tcp", net.JoinHostPort(host, port)); err != nil {
			return nil, "", err
		}
	} else if forceFirefoxFail.Load() {
		log.Printf("%s: the Firefox handshake is switched off (test) — standard TLS", host)
	}
	sc := tls.Client(raw, &tls.Config{ServerName: host, RootCAs: roots, NextProtos: protos, MinVersion: tls.VersionTLS12})
	if err := sc.HandshakeContext(ctx); err != nil {
		raw.Close()
		if isCertError(err) {
			stats.refused.Add(1)
			return nil, "", fmt.Errorf("the site's certificate does not hold: %w", err)
		}
		return nil, "", err
	}
	stats.fallback.Add(1)
	return sc, sc.ConnectionState().NegotiatedProtocol, nil
}

// ── the tunnel ───────────────────────────────────────────────────────────────────────────────────────────────────────

func handleConnect(ca *authority, w http.ResponseWriter, r *http.Request) {
	host, port, err := net.SplitHostPort(r.Host)
	if err != nil {
		host, port = r.Host, "443"
	}
	hj, ok := w.(http.Hijacker)
	if !ok {
		http.Error(w, "no hijack", http.StatusInternalServerError)
		return
	}
	client, _, err := hj.Hijack()
	if err != nil {
		return
	}
	stats.tunnels.Add(1)
	if _, err := client.Write([]byte("HTTP/1.1 200 Connection Established\r\n\r\n")); err != nil {
		client.Close()
		return
	}
	var upstream net.Conn
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	browser := tls.Server(client, &tls.Config{
		MinVersion: tls.VersionTLS12,
		GetConfigForClient: func(hello *tls.ClientHelloInfo) (*tls.Config, error) {
			up, proto, err := dialUpstream(ctx, host, port, offered(hello.SupportedProtos))
			if err != nil {
				log.Printf("%s: %v", host, err)
				return nil, err
			}
			upstream = up
			leaf, err := ca.leafFor(host)
			if err != nil {
				up.Close()
				return nil, err
			}
			cfg := &tls.Config{Certificates: []tls.Certificate{*leaf}, MinVersion: tls.VersionTLS12}
			if proto != "" {
				cfg.NextProtos = []string{proto}
			}
			return cfg, nil
		},
	})
	if err := browser.HandshakeContext(ctx); err != nil {
		client.Close()
		if upstream != nil {
			upstream.Close()
		}
		return
	}
	relay(browser, upstream)
}

func relay(a, b net.Conn) {
	var once sync.Once
	done := func() { once.Do(func() { a.Close(); b.Close() }) }
	go func() { io.Copy(a, b); done() }()
	io.Copy(b, a)
	done()
}

// ── main ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

type server struct {
	ca *authority
}

func (s *server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodConnect {
		handleConnect(s.ca, w, r)
		return
	}
	if r.URL.Path == "/health" || r.URL.Path == "/status" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"ok": true, "version": version, "caFingerprint": s.ca.fingerprint(),
			"tunnels": stats.tunnels.Load(), "firefox": stats.firefox.Load(), "fallback": stats.fallback.Load(), "refused": stats.refused.Load()})
		return
	}
	http.Error(w, "cg-tls-helper carries CONNECT tunnels only", http.StatusMethodNotAllowed)
}

// serve starts on listen (loopback only) and returns the bound port
func serve(listen, caDir, upstreamCA string) (*http.Server, net.Listener, *authority, error) {
	h, _, err := net.SplitHostPort(listen)
	if err != nil {
		return nil, nil, nil, err
	}
	if ip := net.ParseIP(h); h != "localhost" && (ip == nil || !ip.IsLoopback()) {
		return nil, nil, nil, errors.New("listens on loopback only (127.0.0.1 or ::1), not " + h)
	}
	if upstreamCA != "" {
		pool, err := x509.SystemCertPool()
		if err != nil || pool == nil {
			pool = x509.NewCertPool()
		}
		b, err := os.ReadFile(upstreamCA)
		if err != nil {
			return nil, nil, nil, err
		}
		if !pool.AppendCertsFromPEM(b) {
			return nil, nil, nil, errors.New("no certificate in " + upstreamCA)
		}
		roots = pool
	}
	ca, err := loadOrCreateCA(caDir)
	if err != nil {
		return nil, nil, nil, err
	}
	ln, err := net.Listen("tcp", listen)
	if err != nil {
		return nil, nil, nil, err
	}
	srv := &http.Server{Handler: &server{ca: ca}, ReadHeaderTimeout: 15 * time.Second}
	go srv.Serve(ln)
	return srv, ln, ca, nil
}

func main() {
	listen := flag.String("listen", "127.0.0.1:7703", "loopback address to listen on")
	caDir := flag.String("ca-dir", "", "where the local CA is kept (required)")
	upstreamCA := flag.String("upstream-ca", "", "extra root certificates (PEM) to trust for sites, besides the system's (tests)")
	showVersion := flag.Bool("version", false, "print the version")
	parentPipe := flag.Bool("exit-with-parent", false, "exit when stdin closes (the parent died): never an orphan holding the port")
	flag.Parse()
	log.SetPrefix("[cg-tls-helper] ")
	log.SetFlags(0)
	if *showVersion {
		fmt.Println(version)
		return
	}
	if *caDir == "" {
		log.Fatal("-ca-dir is required")
	}
	_, ln, ca, err := serve(*listen, *caDir, *upstreamCA)
	if err != nil {
		json.NewEncoder(os.Stdout).Encode(map[string]any{"ready": false, "error": err.Error()})
		os.Exit(1)
	}
	port, _ := strconv.Atoi(func() string { _, p, _ := net.SplitHostPort(ln.Addr().String()); return p }())
	json.NewEncoder(os.Stdout).Encode(map[string]any{"ready": true, "version": version, "port": port, "caFingerprint": ca.fingerprint(), "caPath": filepath.Join(*caDir, "ca.pem")})
	if *parentPipe {
		go func() {
			io.Copy(io.Discard, os.Stdin)
			log.Print("stdin closed (Clear Glass is gone) — exiting")
			os.Exit(0)
		}()
	}
	select {}
}
