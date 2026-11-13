// cos/app/service-host/cos-svc.cs — COS's own Windows service host (CA8, COS 0.9.0). Built to cos/app/bin/cos-svc.exe by build.cmd beside it.
// Map: docs/2026-11-02-cos-the-application-phasemap.spec CA8_cos_own_service_host.
//
// James, 2026-11-13, told the service needs nssm.exe, which is not on his machine and not in his NSSM.zip: "need to build it from scratch."
//
// A Node process cannot answer Windows' service control manager; this program does, and runs Nexus under it. It replaces nssm.exe for COS:
// it installs itself as the service, starts one child (node + Nexus's autopilot), writes the child's output to rotated logs, starts it again
// when it exits (delay doubling to a ceiling, back to the first delay after a minute up) and, from his NSM v2, when it is up but does not
// answer its health URL. Stopping the service ends the child's whole process tree. Needs only .NET Framework 4.x, which Windows 10/11 carry.
//
//   cos-svc install <config.json>     create the service (auto start, LocalSystem) running: cos-svc run <config.json>     [admin]
//   cos-svc start|stop [name]         start or stop it                                                                  [admin]
//   cos-svc remove [name] [confirm]   stop and delete it                                                                [admin]
//   cos-svc status [name]             SERVICE_RUNNING | SERVICE_STOPPED | ... ; "does not exist (1060)" when missing
//   cos-svc run <config.json>         what the service control manager starts
//   cos-svc console <config.json>     the same loop in this terminal, no service (to try a config; Ctrl+C stops it)
//
// config.json: { name, displayName, description, node, entry, args[], dir, env{}, logDir, rotateBytes, restartDelayMs, maxDelayMs,
//                healthUrl, healthGraceMs, healthEveryMs, healthFails }
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.ServiceProcess;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

namespace CosSvc
{
    sealed class Config
    {
        public string File;
        public string Name = "NexusCOS";
        public string DisplayName = "Nexus (COS supervisor)";
        public string Description = "";
        public string Node;
        public string Entry;
        public string[] Args = new string[0];
        public string Dir;
        public Dictionary<string, string> Env = new Dictionary<string, string>();
        public string LogDir;
        public long RotateBytes = 10L * 1024 * 1024;
        public int RestartDelayMs = 2000;
        public int MaxDelayMs = 30000;
        public string HealthUrl = null;
        public int HealthGraceMs = 120000;
        public int HealthEveryMs = 30000;
        public int HealthFails = 3;

        static string S(Dictionary<string, object> d, string k, string dflt)
        {
            object v; return d.TryGetValue(k, out v) && v != null ? Convert.ToString(v) : dflt;
        }
        static long N(Dictionary<string, object> d, string k, long dflt)
        {
            object v; if (!d.TryGetValue(k, out v) || v == null) return dflt;
            try { return Convert.ToInt64(v); } catch { return dflt; }
        }

        public static Config Load(string file)
        {
            string full = Path.GetFullPath(file);
            var d = new JavaScriptSerializer().DeserializeObject(System.IO.File.ReadAllText(full, Encoding.UTF8)) as Dictionary<string, object>;
            if (d == null) throw new Exception("the config is not a JSON object: " + full);
            var c = new Config();
            c.File = full;
            c.Name = S(d, "name", c.Name);
            c.DisplayName = S(d, "displayName", c.DisplayName);
            c.Description = S(d, "description", c.Description);
            c.Node = S(d, "node", null);
            c.Entry = S(d, "entry", null);
            c.Dir = S(d, "dir", null);
            c.LogDir = S(d, "logDir", null);
            c.RotateBytes = N(d, "rotateBytes", c.RotateBytes);
            c.RestartDelayMs = (int)N(d, "restartDelayMs", c.RestartDelayMs);
            c.MaxDelayMs = (int)N(d, "maxDelayMs", c.MaxDelayMs);
            c.HealthUrl = S(d, "healthUrl", null);
            c.HealthGraceMs = (int)N(d, "healthGraceMs", c.HealthGraceMs);
            c.HealthEveryMs = (int)N(d, "healthEveryMs", c.HealthEveryMs);
            c.HealthFails = (int)N(d, "healthFails", c.HealthFails);
            object o;
            if (d.TryGetValue("args", out o) && o is object[])
            {
                var list = new List<string>(); foreach (object a in (object[])o) list.Add(Convert.ToString(a)); c.Args = list.ToArray();
            }
            if (d.TryGetValue("env", out o) && o is Dictionary<string, object>)
                foreach (var kv in (Dictionary<string, object>)o) c.Env[kv.Key] = Convert.ToString(kv.Value);
            if (string.IsNullOrEmpty(c.Node)) throw new Exception("the config names no node");
            if (string.IsNullOrEmpty(c.Entry)) throw new Exception("the config names no entry");
            if (string.IsNullOrEmpty(c.Dir)) c.Dir = Path.GetDirectoryName(c.Entry);
            if (string.IsNullOrEmpty(c.LogDir)) c.LogDir = Path.Combine(c.Dir, "data", "cos-service");
            if (c.RestartDelayMs < 100) c.RestartDelayMs = 100;
            if (c.MaxDelayMs < c.RestartDelayMs) c.MaxDelayMs = c.RestartDelayMs;
            return c;
        }
    }

    /// One log file, appended a line at a time; past the limit it becomes <name>.1.log (the one before is dropped) and a new one starts.
    sealed class RotLog
    {
        readonly string file; readonly long limit; readonly object gate = new object();
        public RotLog(string file, long limit) { this.file = file; this.limit = limit; Directory.CreateDirectory(Path.GetDirectoryName(file)); }
        public void Line(string s)
        {
            lock (gate)
            {
                try
                {
                    var fi = new FileInfo(file);
                    if (fi.Exists && fi.Length >= limit)
                    {
                        string old = Path.Combine(fi.DirectoryName, Path.GetFileNameWithoutExtension(file) + ".1" + Path.GetExtension(file));
                        if (System.IO.File.Exists(old)) System.IO.File.Delete(old);
                        System.IO.File.Move(file, old);
                    }
                    System.IO.File.AppendAllText(file, s + "\r\n", new UTF8Encoding(false));
                }
                catch { /* a log that cannot be written must not stop the service */ }
            }
        }
    }

    sealed class Runner
    {
        readonly Config c; readonly RotLog outLog, errLog, host; readonly bool echo;
        readonly ManualResetEvent wake = new ManualResetEvent(false);
        volatile bool stopping; volatile bool unhealthy; Process child; Thread loop, watch; readonly object gate = new object();

        public Runner(Config c, bool echo)
        {
            this.c = c; this.echo = echo;
            outLog = new RotLog(Path.Combine(c.LogDir, "service.log"), c.RotateBytes);
            errLog = new RotLog(Path.Combine(c.LogDir, "service-error.log"), c.RotateBytes);
            host = new RotLog(Path.Combine(c.LogDir, "service-host.log"), c.RotateBytes);
        }

        void Say(string s)
        {
            string line = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ") + " [cos-svc] " + s;
            host.Line(line); if (echo) Console.WriteLine(line);
        }

        public static string Quote(string a)
        {
            if (a.Length > 0 && a.IndexOfAny(new[] { ' ', '\t', '"' }) < 0) return a;
            var sb = new StringBuilder("\""); int bs = 0;
            foreach (char ch in a)
            {
                if (ch == '\\') { bs++; continue; }
                if (ch == '"') { sb.Append('\\', bs * 2 + 1); sb.Append('"'); bs = 0; continue; }
                sb.Append('\\', bs); bs = 0; sb.Append(ch);
            }
            sb.Append('\\', bs * 2); sb.Append('"');
            return sb.ToString();
        }

        public void Start()
        {
            Say("starting: " + c.Node + " " + c.Entry + " " + string.Join(" ", c.Args) + " (in " + c.Dir + ")");
            loop = new Thread(Loop); loop.IsBackground = true; loop.Start();
            if (!string.IsNullOrEmpty(c.HealthUrl)) { watch = new Thread(Watch); watch.IsBackground = true; watch.Start(); }
        }

        void Loop()
        {
            int delay = c.RestartDelayMs;
            while (!stopping)
            {
                DateTime at = DateTime.UtcNow;
                int code = RunOnce();
                if (stopping) break;
                double up = (DateTime.UtcNow - at).TotalSeconds;
                if (up >= 60) delay = c.RestartDelayMs;
                Say("the process ended (exit " + code + ") after " + up.ToString("0") + " s" + (unhealthy ? ", stopped for not answering its health URL" : "") + "; starting it again in " + delay + " ms");
                unhealthy = false;
                if (wake.WaitOne(delay)) break;
                delay = Math.Min(delay * 2, c.MaxDelayMs);
            }
        }

        int RunOnce()
        {
            try
            {
                var si = new ProcessStartInfo();
                si.FileName = c.Node;
                var parts = new List<string>(); parts.Add(Quote(c.Entry)); foreach (string a in c.Args) parts.Add(Quote(a));
                si.Arguments = string.Join(" ", parts.ToArray());
                si.WorkingDirectory = c.Dir; si.UseShellExecute = false; si.CreateNoWindow = true;
                si.RedirectStandardOutput = true; si.RedirectStandardError = true;
                si.StandardOutputEncoding = Encoding.UTF8; si.StandardErrorEncoding = Encoding.UTF8;
                foreach (var kv in c.Env) si.EnvironmentVariables[kv.Key] = kv.Value;
                var p = new Process(); p.StartInfo = si;
                p.OutputDataReceived += delegate(object s, DataReceivedEventArgs e) { if (e.Data != null) { outLog.Line(e.Data); if (echo) Console.WriteLine(e.Data); } };
                p.ErrorDataReceived += delegate(object s, DataReceivedEventArgs e) { if (e.Data != null) { errLog.Line(e.Data); if (echo) Console.Error.WriteLine(e.Data); } };
                p.Start(); p.BeginOutputReadLine(); p.BeginErrorReadLine();
                lock (gate) child = p;
                Say("started pid " + p.Id);
                p.WaitForExit();
                int code = p.ExitCode;
                lock (gate) child = null;
                p.Dispose();
                return code;
            }
            catch (Exception e) { Say("could not start the process: " + e.Message); return -1; }
        }

        /// From his NSM v2: a process that is up but does not answer is started again. Quiet for the grace period after each start.
        void Watch()
        {
            int fails = 0; int seenPid = 0; DateTime since = DateTime.UtcNow;
            while (!stopping)
            {
                if (wake.WaitOne(c.HealthEveryMs)) break;
                int pid; lock (gate) pid = child == null ? 0 : child.Id;
                if (pid == 0) { fails = 0; continue; }
                if (pid != seenPid) { seenPid = pid; since = DateTime.UtcNow; fails = 0; }
                if ((DateTime.UtcNow - since).TotalMilliseconds < c.HealthGraceMs) continue;
                if (Healthy()) { fails = 0; continue; }
                fails++;
                Say("the health URL did not answer (" + fails + " of " + c.HealthFails + "): " + c.HealthUrl);
                if (fails >= c.HealthFails) { fails = 0; unhealthy = true; KillTree(pid); }
            }
        }

        bool Healthy()
        {
            try
            {
                var rq = (HttpWebRequest)WebRequest.Create(c.HealthUrl); rq.Timeout = 5000; rq.ReadWriteTimeout = 5000; rq.Proxy = null;
                using (var rs = (HttpWebResponse)rq.GetResponse()) return (int)rs.StatusCode >= 200 && (int)rs.StatusCode < 300;
            }
            catch { return false; }
        }

        void KillTree(int pid)
        {
            try
            {
                var si = new ProcessStartInfo(Path.Combine(Environment.SystemDirectory, "taskkill.exe"), "/PID " + pid + " /T /F");
                si.UseShellExecute = false; si.CreateNoWindow = true;
                using (var k = Process.Start(si)) k.WaitForExit(15000);
            }
            catch (Exception e) { Say("taskkill failed: " + e.Message); }
            try { Process p; lock (gate) p = child; if (p != null && !p.HasExited) p.Kill(); } catch { }
        }

        public void Stop()
        {
            stopping = true; wake.Set();
            int pid; lock (gate) pid = child == null ? 0 : child.Id;
            if (pid != 0) { Say("stopping: ending pid " + pid + " and every process it started"); KillTree(pid); }
            if (loop != null) loop.Join(20000);
            Say("stopped");
        }
    }

    sealed class Svc : ServiceBase
    {
        readonly Runner r;
        public Svc(Config c) { ServiceName = c.Name; CanStop = true; CanShutdown = true; AutoLog = true; r = new Runner(c, false); }
        protected override void OnStart(string[] args) { r.Start(); }
        protected override void OnStop() { r.Stop(); }
        protected override void OnShutdown() { r.Stop(); }
    }

    static class Scm
    {
        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        static extern IntPtr OpenSCManager(string machine, string db, uint access);
        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        static extern IntPtr CreateService(IntPtr scm, string name, string display, uint access, uint type, uint start, uint error,
            string binPath, string group, IntPtr tag, string deps, string account, string password);
        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        static extern IntPtr OpenService(IntPtr scm, string name, uint access);
        [DllImport("advapi32.dll", SetLastError = true)]
        static extern bool DeleteService(IntPtr svc);
        [DllImport("advapi32.dll", SetLastError = true)]
        static extern bool CloseServiceHandle(IntPtr h);

        const uint SC_MANAGER_ALL_ACCESS = 0xF003F, SERVICE_ALL_ACCESS = 0xF01FF, DELETE = 0x10000;
        const uint SERVICE_WIN32_OWN_PROCESS = 0x10, SERVICE_AUTO_START = 2, SERVICE_ERROR_NORMAL = 1;

        static string Why(int code) { return new System.ComponentModel.Win32Exception(code).Message + " (" + code + ")"; }

        public static void Create(Config c, string self)
        {
            IntPtr scm = OpenSCManager(null, null, SC_MANAGER_ALL_ACCESS);
            if (scm == IntPtr.Zero) throw new Exception("the service control manager refused: " + Why(Marshal.GetLastWin32Error()) + " — run as administrator");
            try
            {
                string bin = Runner.Quote(self) + " run " + Runner.Quote(c.File);
                IntPtr s = CreateService(scm, c.Name, c.DisplayName, SERVICE_ALL_ACCESS, SERVICE_WIN32_OWN_PROCESS, SERVICE_AUTO_START, SERVICE_ERROR_NORMAL,
                    bin, null, IntPtr.Zero, null, null, null);   // account null = LocalSystem
                if (s == IntPtr.Zero) throw new Exception("the service could not be created: " + Why(Marshal.GetLastWin32Error()));
                CloseServiceHandle(s);
            }
            finally { CloseServiceHandle(scm); }
            // not vital, so a failure here is said and the install stands: its description, and Windows restarting this host if it dies itself
            if (!string.IsNullOrEmpty(c.Description)) Sc("description " + Runner.Quote(c.Name) + " " + Runner.Quote(c.Description));
            Sc("failure " + Runner.Quote(c.Name) + " reset= 86400 actions= restart/5000/restart/5000/restart/5000");
        }

        static void Sc(string args)
        {
            try
            {
                var si = new ProcessStartInfo(Path.Combine(Environment.SystemDirectory, "sc.exe"), args); si.UseShellExecute = false; si.CreateNoWindow = true;
                using (var p = Process.Start(si)) { p.WaitForExit(15000); if (p.ExitCode != 0) Console.Error.WriteLine("note: sc " + args.Split(' ')[0] + " answered " + p.ExitCode); }
            }
            catch (Exception e) { Console.Error.WriteLine("note: sc " + args.Split(' ')[0] + ": " + e.Message); }
        }

        public static void Delete(string name)
        {
            IntPtr scm = OpenSCManager(null, null, SC_MANAGER_ALL_ACCESS);
            if (scm == IntPtr.Zero) throw new Exception("the service control manager refused: " + Why(Marshal.GetLastWin32Error()) + " — run as administrator");
            try
            {
                IntPtr s = OpenService(scm, name, DELETE);
                if (s == IntPtr.Zero) throw new Exception("the service could not be opened: " + Why(Marshal.GetLastWin32Error()));
                try { if (!DeleteService(s)) throw new Exception("the service could not be deleted: " + Why(Marshal.GetLastWin32Error())); }
                finally { CloseServiceHandle(s); }
            }
            finally { CloseServiceHandle(scm); }
        }
    }

    static class Program
    {
        const string DEFAULT = "NexusCOS";

        static string Words(ServiceControllerStatus s)
        {
            switch (s)
            {
                case ServiceControllerStatus.Running: return "SERVICE_RUNNING";
                case ServiceControllerStatus.Stopped: return "SERVICE_STOPPED";
                case ServiceControllerStatus.StartPending: return "SERVICE_START_PENDING";
                case ServiceControllerStatus.StopPending: return "SERVICE_STOP_PENDING";
                case ServiceControllerStatus.Paused: return "SERVICE_PAUSED";
                default: return "SERVICE_" + s.ToString().ToUpperInvariant();
            }
        }

        static bool Exists(string name)
        {
            foreach (var s in ServiceController.GetServices()) if (string.Equals(s.ServiceName, name, StringComparison.OrdinalIgnoreCase)) return true;
            return false;
        }

        static int Main(string[] a)
        {
            string verb = a.Length > 0 ? a[0].ToLowerInvariant() : "";
            string arg = a.Length > 1 ? a[1] : null;
            try
            {
                switch (verb)
                {
                    case "run":
                        ServiceBase.Run(new Svc(Config.Load(arg)));
                        return 0;
                    case "console":
                    {
                        var r = new Runner(Config.Load(arg), true);
                        var done = new ManualResetEvent(false);
                        Console.CancelKeyPress += delegate(object s, ConsoleCancelEventArgs e) { e.Cancel = true; done.Set(); };
                        r.Start();
                        int ms = a.Length > 2 ? int.Parse(a[2]) : Timeout.Infinite;   // console <config> <ms>: stop by itself after ms (for a test)
                        done.WaitOne(ms);
                        r.Stop();
                        return 0;
                    }
                    case "install":
                    {
                        var c = Config.Load(arg);
                        if (Exists(c.Name)) { Console.Error.WriteLine("the service " + c.Name + " already exists: remove it first"); return 2; }
                        Scm.Create(c, System.Reflection.Assembly.GetExecutingAssembly().Location);
                        Console.WriteLine("installed " + c.Name + ": " + c.Node + " " + c.Entry);
                        return 0;
                    }
                    case "start":
                    {
                        string name = arg ?? DEFAULT;
                        using (var sc = new ServiceController(name))
                        {
                            if (sc.Status != ServiceControllerStatus.Running) { sc.Start(); sc.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(30)); }
                            Console.WriteLine(Words(sc.Status));
                        }
                        return 0;
                    }
                    case "stop":
                    {
                        string name = arg ?? DEFAULT;
                        if (!Exists(name)) { Console.Error.WriteLine("The specified service does not exist (1060)"); return 3; }
                        using (var sc = new ServiceController(name))
                        {
                            if (sc.Status != ServiceControllerStatus.Stopped) { sc.Stop(); sc.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(40)); }
                            Console.WriteLine(Words(sc.Status));
                        }
                        return 0;
                    }
                    case "remove":
                    {
                        string name = arg ?? DEFAULT;
                        if (!Exists(name)) { Console.Error.WriteLine("The specified service does not exist (1060)"); return 3; }
                        using (var sc = new ServiceController(name))
                            if (sc.Status != ServiceControllerStatus.Stopped) { try { sc.Stop(); sc.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(40)); } catch { } }
                        Scm.Delete(name);
                        Console.WriteLine("removed " + name);
                        return 0;
                    }
                    case "status":
                    {
                        string name = arg ?? DEFAULT;
                        if (!Exists(name)) { Console.WriteLine("The specified service does not exist (1060)"); return 3; }
                        using (var sc = new ServiceController(name)) Console.WriteLine(Words(sc.Status));
                        return 0;
                    }
                    default:
                        Console.WriteLine("cos-svc install <config.json> | start [name] | stop [name] | remove [name] | status [name] | run <config.json> | console <config.json> [ms]");
                        return verb == "" || verb == "help" ? 0 : 64;
                }
            }
            catch (Exception e)
            {
                Console.Error.WriteLine("cos-svc " + verb + ": " + e.Message);
                return 1;
            }
        }
    }
}
