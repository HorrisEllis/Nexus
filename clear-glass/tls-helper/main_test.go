package main

// docs/2026-10-16-tls-layer-phasemap.spec TLS1 — James: "fix it. i don't want the trouble again"
//   TH-1  a site sees Firefox's ClientHello (ffdhe groups and X25519MLKEM768, which Chrome's does not carry together), h2 through
//   TH-2  a browser offering only http/1.1 (a WebSocket connection) gets http/1.1 end to end
//   TH-3  a site whose certificate does not hold is refused — never retried, never passed
//   TH-4  a Firefox handshake the site refuses is retried with standard TLS: the site still loads (never the reason it fails)
//   TH-5  the CA is kept across restarts; loopback only

import (
	"crypto/tls"
	"crypto/x509"
	"encoding/pem"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	utls "github.com/refraction-networking/utls"
)

type seen struct {
	mu     sync.Mutex
	curves []tls.CurveID
	protos []string
}

func site(t *testing.T, h2 bool) (*httptest.Server, *seen, string) {
	s := &seen{}
	srv := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, "hello "+r.Proto) }))
	srv.EnableHTTP2 = h2
	srv.TLS = &tls.Config{GetConfigForClient: func(hi *tls.ClientHelloInfo) (*tls.Config, error) {
		s.mu.Lock()
		s.curves, s.protos = hi.SupportedCurves, hi.SupportedProtos
		s.mu.Unlock()
		return nil, nil
	}}
	srv.StartTLS()
	t.Cleanup(srv.Close)
	pemPath := filepath.Join(t.TempDir(), "site.pem")
	os.WriteFile(pemPath, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: srv.Certificate().Raw}), 0o644)
	return srv, s, pemPath
}

func helper(t *testing.T, upstreamCA string) (string, *x509.CertPool, string) {
	dir := t.TempDir()
	roots = nil
	srv, ln, ca, err := serve("127.0.0.1:0", dir, upstreamCA)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { srv.Close() })
	pool := x509.NewCertPool()
	pool.AppendCertsFromPEM(ca.certPEM)
	return "http://" + ln.Addr().String(), pool, dir
}

func client(proxy string, pool *x509.CertPool, h2 bool) *http.Client {
	u, _ := url.Parse(proxy)
	tr := &http.Transport{Proxy: http.ProxyURL(u), TLSClientConfig: &tls.Config{RootCAs: pool}, ForceAttemptHTTP2: h2}
	if !h2 {
		tr.TLSNextProto = map[string]func(string, *tls.Conn) http.RoundTripper{}
	}
	return &http.Client{Transport: tr}
}

func has(cs []tls.CurveID, c tls.CurveID) bool {
	for _, x := range cs {
		if x == c {
			return true
		}
	}
	return false
}

func TestFirefoxHelloAndH2(t *testing.T) {
	srv, s, pemPath := site(t, true)
	proxy, pool, _ := helper(t, pemPath)
	resp, err := client(proxy, pool, true).Get(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	b, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.Proto != "HTTP/2.0" || string(b) != "hello HTTP/2.0" {
		t.Fatalf("TH-1 want h2 end to end, got %s / %q", resp.Proto, b)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if !has(s.curves, 256) || !has(s.curves, 257) || !has(s.curves, tls.CurveID(utls.X25519MLKEM768)) {
		t.Fatalf("TH-1 the site did not see Firefox's groups: %v", s.curves)
	}
	if strings.Join(s.protos, ",") != "h2,http/1.1" {
		t.Fatalf("TH-1 ALPN %v", s.protos)
	}
}

func TestHTTP11Only(t *testing.T) {
	srv, s, pemPath := site(t, true)
	proxy, pool, _ := helper(t, pemPath)
	resp, err := client(proxy, pool, false).Get(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	b, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	s.mu.Lock()
	defer s.mu.Unlock()
	if resp.Proto != "HTTP/1.1" || string(b) != "hello HTTP/1.1" || strings.Join(s.protos, ",") != "http/1.1" {
		t.Fatalf("TH-2 want http/1.1 end to end: %s %q, site saw %v", resp.Proto, b, s.protos)
	}
}

func TestBadCertificateRefused(t *testing.T) {
	srv, _, _ := site(t, true)
	proxy, pool, _ := helper(t, "") // the site's certificate is not trusted
	before := stats.refused.Load()
	if _, err := client(proxy, pool, true).Get(srv.URL); err == nil {
		t.Fatal("TH-3 a site whose certificate does not hold was passed")
	}
	if stats.refused.Load() != before+1 {
		t.Fatalf("TH-3 refused count %d → %d", before, stats.refused.Load())
	}
}

func TestStandardTLSRetry(t *testing.T) {
	srv, _, pemPath := site(t, true)
	proxy, pool, _ := helper(t, pemPath)
	forceFirefoxFail.Store(true)
	defer forceFirefoxFail.Store(false)
	before := stats.fallback.Load()
	resp, err := client(proxy, pool, true).Get(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != 200 || stats.fallback.Load() != before+1 {
		t.Fatalf("TH-4 the retry did not carry the site: %d, fallback %d → %d", resp.StatusCode, before, stats.fallback.Load())
	}
}

func TestCAKeptAndLoopbackOnly(t *testing.T) {
	dir := t.TempDir()
	a, err := loadOrCreateCA(dir)
	if err != nil {
		t.Fatal(err)
	}
	b, _ := loadOrCreateCA(dir)
	if a.fingerprint() != b.fingerprint() {
		t.Fatal("TH-5 the CA changed across a restart")
	}
	if st, _ := os.Stat(filepath.Join(dir, "ca-key.pem")); st.Mode().Perm() != 0o600 {
		t.Fatalf("TH-5 the CA key is %v, want 0600", st.Mode().Perm())
	}
	if _, _, _, err := serve("0.0.0.0:0", dir, ""); err == nil {
		t.Fatal("TH-5 it listened beyond loopback")
	}
}
