'use strict';
// emerge/lang/test/native.test.js — CIE-EG §10.2: every program in the native subset must give the same stdout and the
// same exit status when compiled by `eg native` (Emerge's own code generator, no Node at run time) as when interpreted.
// Linux x86-64 only: the ELF output is run directly.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

if (process.platform !== 'linux' || process.arch !== 'x64') {
  console.log('skipped: native executables are Linux x86-64 for now (the Windows target is MOD-NATIVE-WINDOWS in cie-eg.spec)');
  process.exit(0);
}

const LANG = path.join(__dirname, '..');
const EG = path.join(LANG, 'eg.js');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'emerge-native-'));
const MIN = '-9223372036854775807i - 1i';
const MAX = '9223372036854775807i';

const CASES = {
  'arithmetic': `print(1i + 2i * 3i, 10i - 4i, -5i, 6i * -7i)`,
  'floored modulo': `print(7i % 3i, -7i % 3i, 7i % -3i, -7i % -3i, 0i % 5i, 6i % 3i, -6i % 3i)`,
  'modulo by minus one': `print(${MIN} % -1i, 5i % -1i)`,
  'int extremes print': `print(${MAX}, ${MIN}, 0i, -1i, 1000000i)`,
  'large literals': `let a = 4611686018427387904i\nlet b = 123456789012345678i\nprint(a, b, a - b)`,
  'comparisons': `print(1i < 2i, 2i < 1i, 2i <= 2i, 3i > 2i, 2i >= 3i, 4i == 4i, 4i != 4i, -1i < 1i)`,
  'bool logic': `print(true and false, true or false, not true, not false, (1i < 2i) and (3i > 2i))`,
  'bool equality': `print(true == true, true != false, (1i < 2i) == (2i < 3i))`,
  'short circuit': `fn boom(n: int): bool {\n  print("boom", n)\n  return true\n}\nprint(false and boom(1i), true or boom(2i))\nprint(true and boom(3i), false or boom(4i))`,
  'while and assignment ops': `var i = 0i\nvar s = 0i\nwhile i < 5i {\n  s += i\n  s *= 2i\n  s -= 1i\n  i += 1i\n}\nprint(i, s)`,
  'for range': `var t = 0i\nfor k in 1i..6i { t += k }\nprint(t)\nfor z in 5i..5i { print("never") }\nfor z in 6i..5i { print("never") }`,
  'break and skip': `for k in 0i..10i {\n  if k == 2i { skip }\n  if k == 5i { break }\n  print(k)\n}\nvar n = 0i\nwhile true {\n  n += 1i\n  if n < 3i { skip }\n  if n > 4i { break }\n  print("w", n)\n}`,
  'nested loops': `for a in 1i..4i {\n  for b in 1i..4i {\n    if b == 2i { skip }\n    print(a, b, a * b)\n  }\n}`,
  'else if chain': `fn sign(n: int): int {\n  if n < 0i { return -1i } else if n == 0i { return 0i } else { return 1i }\n}\nprint(sign(-9i), sign(0i), sign(9i))`,
  'recursion': `fn fact(n: int): int {\n  if n <= 1i { return 1i }\n  return n * fact(n - 1i)\n}\nfn fib(n: int): int {\n  if n < 2i { return n }\n  return fib(n - 1i) + fib(n - 2i)\n}\nprint(fact(20i), fib(20i))`,
  'many parameters': `fn f(a: int, b: int, c: int, d: int): int { return a - b * c + d }\nprint(f(10i, 2i, 3i, 4i))`,
  'mutual recursion': `fn even(n: int): bool {\n  if n == 0i { return true }\n  return odd(n - 1i)\n}\nfn odd(n: int): bool {\n  if n == 0i { return false }\n  return even(n - 1i)\n}\nprint(even(10i), odd(7i), even(7i))`,
  'bool function': `fn is_big(n: int): bool { return n > 100i }\nprint(is_big(5i), is_big(500i))`,
  'shadowing in blocks': `let x = 1i\nif true {\n  let x = 2i\n  print(x)\n}\nprint(x)`,
  'strings and spacing': `print("a", "b")\nprint()\nprint("")\nprint("x", "", "y")\nprint("tab\\there", 1i)`,
  'unicode string': `print("héllo → ✓", 2i)`,
  'gcd': `fn gcd(a: int, b: int): int {\n  if b == 0i { return a }\n  return gcd(b, a % b)\n}\nprint(gcd(48i, 18i), gcd(17i, 5i), gcd(0i, 9i))`,
  // refusals: both must exit 1, with nothing on stdout before the error
  'overflow add traps': { src: `print("before")\nprint(${MAX} + 1i)\nprint("after")`, code: 1 },
  'overflow sub traps': { src: `print("before")\nprint(${MIN} - 1i)`, code: 1 },
  'overflow mul traps': { src: `print("before")\nprint(${MAX} * 2i)`, code: 1 },
  'negating the minimum traps': { src: `print("before")\nprint(-(${MIN}))`, code: 1 },
  'overflow in += traps': { src: `var a = ${MAX}\nprint("before")\na += 1i`, code: 1 },
  'modulo by zero traps': { src: `print("before")\nprint(5i % 0i)`, code: 1 },
  // ── dynamic values (2026-10-28: the runtime in rt.eg) ──
  'nums': `print(1 + 2 * 3, 10 - 4, -5, 7 % 3, -7 % 3, 7 % -3, idiv(7, 2), idiv(-7, 2), 12 / 4)\nprint(1 < 2, 2 <= 1, 3 == 3, 3 != 3, 9007199254740992, -9007199254740992)`,
  'num bit operations': `print(5 & 3, 5 | 3, 5 ^ 3, 1 << 4, -16 >> 2, 4294967295 & 255, -1 & 4294967295, 1 << 31, 3 << 30, ~5, ~0, -1 >> 1)`,
  'num bit operations refuse a 33-bit value': { src: `print("before")\nprint(4294967296 & 1)`, code: 1 },
  'num shift counts are 0..31': { src: `print("before")\nprint(1 << 32)`, code: 1 },
  'int bit operations': `print(5i & 3i, 5i | 3i, 5i ^ 3i, 1i << 62, 1i << 63, -16i >> 2, -16i >> 2i, shr_u(-16i, 60), shr_u(-1i, 1), ~5i)`,
  'bit operations do not mix': { src: `print("before")\nprint(1i & 1)`, code: 1 },
  'big ints': `let a = 1152921504606846975i\nlet b = a + 1i\nprint(a, b, b - 1i, b * 2i, -b, b == 1152921504606846976i, idiv(b, 3i), b % 7i)`,
  'conversions': `print(int(5), num(5i), int("123"), int("-42"), num("7"), str(5) + str(6i), type_of(int(5)), type_of(num(5i)))`,
  'strings': `let s = "héllo"\nprint(len(s), byte_len(s), s[1], s[-1], slice(s, 1, 3), slice(s, 2), s + "!", "a" < "b", "b" < "a", "ab" == "ab")\nprint(s contains "ll", s starts_with "hé", s ends_with "lo", "x" + 1 + true + null)`,
  'interpolation': `let n = 3\nlet xs = [1, "a"]\nprint("n={n} xs={xs} m={ {k: 1} } e=\\{\\}")`,
  'lists': `var xs = [1, 2, 3]\nxs[0] = 9\nxs[len(xs)] = 4\nlet ys = xs + [5]\nprint(xs, ys, len(ys), xs[-1], ys contains 5, xs contains 5, push(xs, 7), xs, slice(ys, 1, 3), slice(ys, -2))`,
  'lists are shared': `var a = [1]\nlet b = a\na[0] = 2\na[1] = 3\nprint(a, b, a == b, [1, [2, "x"]] == [1, [2, "x"]], [1] == [2])`,
  'nested printing': `print([1, "two", [3, "fo\\"ur"], {a: "b\\nc", "c d": [null, true]}, ""])\nprint({})\nprint([])\nprint(["tab\\there", "x\\\\y"])`,
  'maps': `var m = {b: 1, a: 2}\nm["c"] = 3\nm.d = 4\nm.b = 10\nprint(m, m.a, m["zz"], m.zz, has(m, "a"), has(m, "q"), get(m, "q", 5), get(m, "a", 5), keys(m), values(m), len(m))`,
  'maps are shared': `var m = {a: 1}\nlet n = m\nm["b"] = 2\nprint(m, n, {a: 1, b: [1]} == {b: [1], a: 1}, {a: 1} == {a: 2})`,
  'many map keys': `var m = {}\nfor i in 0..300 { m["k" + str(i)] = i }\nvar t = 0\nfor k, v in m { t += v }\nprint(len(m), t, m["k0"], m["k150"], m["k299"], keys(m)[7])`,
  'for loops': `for x in [3, 4] { print(x) }\nfor i, x in ["a", "b"] { print(i, x) }\nfor k, v in {p: 1, q: 2} { print(k, v) }\nfor c in "hé" { print(c) }\nfor i in 2..5 { print(i) }\nfor i in 2i..4i { print(i) }\nfor x in [1, 2, 3, 4, 5] {\n  if x == 2 { skip }\n  if x == 4 { break }\n  print("x", x)\n}`,
  'globals and functions': `var count = 0\nvar names = []\nfn add(n) {\n  count += 1\n  names[len(names)] = n\n  return len(names)\n}\nadd("a")\nadd("b")\nprint(count, names, add("c"))`,
  'recursion on lists': `fn qs(xs) {\n  if len(xs) <= 1 { return xs }\n  let p = xs[0]\n  var lo = []\n  var hi = []\n  for x in slice(xs, 1) {\n    if x < p { lo[len(lo)] = x } else { hi[len(hi)] = x }\n  }\n  return qs(lo) + [p] + qs(hi)\n}\nprint(qs([5, 3, 9, 1, 5, 0, -2, 8]))`,
  'coalesce and logic': `let m = {a: 1}\nprint(m.zz ?? "dflt", m.a ?? 5, null ?? null, true and false, false or true, not false)`,
  'bytes': `let b = bytes([104, 105, [33], bytes("é")])\nprint(b, len(b), byte_len(b), b[0], b[-1], slice(b, 1, 3), type_of(b), bytes("ab") == bytes([97, 98]))`,
  'type_of': `print(type_of(null), type_of(true), type_of(1), type_of(1i), type_of("s"), type_of([]), type_of({}), type_of(bytes([])))`,
  'str and repr': `print(str("x"), repr("x"), str([1, "a"]), repr([1, "a"]), str(null), repr(12i))`,
  'range join': `print(range(4), range(2, 5), range(10, 0, -3), range(0, 10, 4), join(["a", "b", "c"], "-"), join([1, 2]))`,
  'range needs nums': { src: `print("before")\nprint(range(2i, 4i))`, code: 1 },
  'min max': `print(min(3, 4), max(3, 4, 9, 1), min([5, 2, 8]), max(2i, 9i), min(7))`,
  'min refuses strings': { src: `print("before")\nprint(min("b", "a"))`, code: 1 },
  'plus with a string on the right': { src: `print("before")\nprint(1 + "a")`, code: 1 },
  'plus on bytes and maps': `print(bytes([1]) + bytes([2, 3]), {a: 1, b: 2} + {b: 3, c: 4})`,
  'files': `let p = "/tmp/emerge-native-test-files.txt"\nwrite_file(p, "héllo\\nworld")\nlet t = read_file(p)\nprint(len(t), t)\nwrite_bytes(p, bytes([1, 2, 255]))\nprint(read_bytes(p))`,
  'index out of range': { src: `print("before")\nlet a = [1, 2]\nprint(a[5])`, code: 1 },
  'type error': { src: `print("before")\nprint("a" - 1)`, code: 1 },
  'raise': { src: `print("before")\nraise("boom")`, code: 1 },
  'division by zero': { src: `print("before")\nprint(1 / 0)`, code: 1 },
  'condition must be bool': { src: `print("before")\nif 1 { print("no") }`, code: 1 },
  'while needs a bool': { src: `print("before")\nwhile "x" { print("no") }`, code: 1 },
  'and needs a bool': { src: `print("before")\nprint(true and [1])`, code: 1 },
  'not needs a bool': { src: `print("before")\nprint(not null)`, code: 1 },
  // ── functions as values, closures, try, the prelude (2026-10-29: MOD-NATIVE-LANG) ──
  'closures share captured variables': `fn make_counter() {\n  var n = 0\n  return fn() {\n    n += 1\n    return n\n  }\n}\nlet c = make_counter()\nlet d = make_counter()\nc()\nprint(c(), c(), d())\nvar k = 1\nlet add_k = fn(x) = x + k\nk = 10\nprint(add_k(1))`,
  'each loop iteration captures its own variable': `var fs = []\nfor i in 0..3 { fs[len(fs)] = fn() = i * 10 }\nfor x in ["a", "b"] { fs[len(fs)] = fn() = x }\nprint(fs[0](), fs[1](), fs[2](), fs[3](), fs[4]())`,
  'nested lambdas': `let adder = fn(a) = fn(b) = fn(c) = a + b + c\nprint(adder(1)(2)(3), type_of(adder), adder)\nfn outer(start) {\n  var x = start\n  let inner = fn() {\n    let deeper = fn() = x * 2\n    x += 1\n    return deeper()\n  }\n  return inner() + x\n}\nprint(outer(5))`,
  'functions and builtins as values': `fn twice(f, x) = f(f(x))\nfn inc(x) = x + 1\nprint(twice(inc, 5), twice(fn(s) = s + "!", "hi"))\nlet g = len\nlet h = get\nprint(g("abc"), h({a: 1}, "b", 7), h({a: 1}, "a"), g, inc)`,
  'calling a value checks it': { src: `let f = fn(a, b) = a\nprint("before")\nf(1)`, code: 1 },
  'calling a non-fn fails': { src: `print("before")\nlet x = 5\nx(1)`, code: 1 },
  'the prelude': `print(map([1, 2, 3], fn(x) = x * x), filter([1, 2, 3, 4], fn(x) = x % 2 == 0), sum([1, 2, 3]), reduce([1, 2, 3], fn(a, b) = a + b, 0))\nprint(find([1, 2, 3], fn(x) = x > 1), any([1], fn(x) = x == 1), all([], fn(x) = false), count([1, 2, 3], fn(x) = x > 1))\nprint(index_of("hello", "l"), index_of([1, 2], 3), reverse("abc"), reverse([1, 2]), split("a,b,,c", ","), split("hé", ""))\nprint(unique([1, 1, 2]), group_by([1, 2, 3], fn(x) = x % 2), zip([1, 2], ["a", "b"]), flatten([[1], 2, [3, [4]]]), without({a: 1, b: 2}, "a"), drop([1, 2, 3], 1), take([1, 2, 3], 2), push([1], 2))`,
  'pipes': `print([1, 2, 3] |> map(fn(x) = x * 2) |> filter(fn(x) = x > 2) |> sum, [3, 1] |> reverse)`,
  'prelude errors are reported at the caller': { src: `print("before")\nprint(map(5, fn(x) = x))`, code: 1 },
  'prelude fn errors from a lambda': { src: `print("before")\nfilter([1], fn(x) = 1)`, code: 1 },
  'power': `print(2 ** 10, 2i ** 62i, 3 ** 0, (-2) ** 3, 0i ** 0i)`,
  'power overflow traps': { src: `print("before")\nprint(2i ** 63i)`, code: 1 },
  'index-like map keys come first': `var m = {}\nm["b"] = 1\nm["10"] = 2\nm["2"] = 3\nm["01"] = 4\nm["a"] = 5\nm["0"] = 6\nprint(m, keys(m), group_by([1, 2, 3], fn(x) = x % 2))`,
  'try catches with message, line and file': `try {\n  print("in")\n  raise("boom")\n  print("not")\n} else e {\n  print("caught", e)\n}\nfn inner(n) {\n  if n == 0 { raise("deep") }\n  return inner(n - 1)\n}\ntry { inner(5) } else e { print(e) }\ntry { print([1][3]) } else e { print(e.message) }\ntry { print(1 + "a" - 1) } else e { print(e.message) }`,
  'nested try and rethrow': `try {\n  try { raise("one") } else e { raise("two: " + e.message) }\n} else e2 { print(e2.message, e2.line) }\ntry { print("fine") } else e { print("no") }\nprint("after")`,
  'return, break and skip leave a try': `fn risky(n) {\n  try {\n    if n > 1 { return "early" }\n    return [1][n]\n  } else e {\n    return "err: " + e.message\n  }\n}\nprint(risky(0), risky(1), risky(5))\nfor k in 0..4 {\n  try {\n    if k == 1 { skip }\n    if k == 3 { break }\n    print("k", k)\n  } else e { print("no") }\n}\ntry { raise("after loop") } else e { print(e.message) }\nvar total = 0\nfor i in 0..100 {\n  try {\n    if i % 3 == 0 { raise("x") }\n    total += i\n  } else e { total -= 1 }\n}\nprint(total)`,
  'an error after a try is not caught': { src: `try { print("a") } else e { print("no") }\nraise("out")`, code: 1 },  // ── 2026-10-31: strings are code points (CIE-EG §2) in both backends; the functions moved from JavaScript into core/prelude.eg ──
  'strings are code points': `let s = "a😀é😀b"\nprint(len(s), s[1], s[-1], slice(s, 1, 3), split(s, ""), find_text(s, "é"), reverse(s), "😀" > utf8(bytes([0xEE, 0x80, 0x80])), "a" < "b")`,
  'moved to the prelude: every case, ok and refused': String.raw`fn t(name, f) {
  try { print(name, repr(f())) } else e { print(name, "ERR", e.message) }
}
t("ceil", fn() = [ceil(1), ceil(-1), ceil(0), ceil(1.2), ceil(-1.2), ceil(-0.5), ceil(9007199254740991)])
t("ceil s", fn() = ceil("x"))
t("ceil i", fn() = ceil(2i))
t("round", fn() = [round(0), round(2.5), round(-2.5), round(-0.5), round(-0.4), round(1.49), round(-1.5), round(3), round(-7), round(1e300)])
t("round s", fn() = round(null))
t("abs", fn() = [abs(-3), abs(3), abs(0), abs(-0.5), abs(-5i), abs(5i), abs(0i), abs(9223372036854775807i), abs(-9223372036854775807i)])
t("abs min", fn() = abs(-9223372036854775807i - 1i))
t("abs s", fn() = abs("a"))
t("sort", fn() = [sort([3, 1, 2]), sort([]), sort([1]), sort(["b", "a", "B", "é", "😀", "z", ""]), sort([2, 2, 1, -1, 0.5])])
t("sort map1", fn() = sort([{a: 1}]))
t("sort mixed", fn() = sort([1, "a"]))
t("sort ints", fn() = sort([2i, 1i]))
t("sort maps", fn() = sort([{}, {}]))
t("sort nl", fn() = sort("abc"))
fn sort_copy() {
  let a = [1]
  var b = sort(a)
  b[0] = 9
  return [a, b]
}
t("sort copy", sort_copy)
fn clone_case() {
  let a = {x: [1, {y: 2}], "2": 3, "1": 4, b: "s"}
  var c = clone(a)
  c.x[1].y = 9
  return [a, c, clone(5), clone("s"), clone(null), clone([]), clone(bytes([1]))]
}
t("clone", clone_case)
t("trim", fn() = [trim("  a b  "), trim("\t\n\r x \r\n"), trim(""), trim("   "), trim("é"), trim(" 😀 ")])
t("trim wide", fn() = [len(trim(utf8(bytes([0xC2, 0xA0, 0x61, 0xE3, 0x80, 0x80, 0xEF, 0xBB, 0xBF])))), len(trim(utf8(bytes([0xE2, 0x80, 0x8B, 0x61]))))])
t("trim vt", fn() = len(trim(utf8(bytes([11, 12, 97, 0xE2, 0x80, 0xA8, 0xE2, 0x80, 0xA9, 0xE1, 0x9A, 0x80, 0xE2, 0x80, 0x8A, 0xE2, 0x80, 0xAF, 0xE2, 0x81, 0x9F, 0xC2, 0x85])))))
t("trim n", fn() = trim(1))
t("replace", fn() = [replace("a.b.c", ".", "-"), replace("aaa", "a", "bb"), replace("", "x", "y"), replace("ab", "", "-"), replace("é😀", "", "|")])
t("replace n", fn() = replace("a", 1, "b"))
t("replace n3", fn() = replace("a", "a", null))
t("hex s", fn() = hex("ab"))
t("from_hex", fn() = [from_hex(""), from_hex("00ff10Ab"), from_hex("DEADbeef")])
t("from_hex odd", fn() = from_hex("abc"))
t("from_hex bad", fn() = from_hex("zz"))
t("from_hex uni", fn() = from_hex("é1"))
t("from_hex n", fn() = from_hex(5))
t("u8", fn() = [u8(0), u8(255), u8(7i)])
t("u8 big", fn() = u8(256))
t("u8 neg", fn() = u8(-1))
t("u8 frac", fn() = u8(1.5))
t("u8 str", fn() = u8("1"))
t("u16", fn() = [u16le(258), u16be(258), u16le(65535)])
t("u16 big", fn() = u16be(65536))
t("u32", fn() = [u32le(4294967295), u32be(305419896), u32le(0)])
t("u32 big", fn() = u32le(4294967296))
t("u64", fn() = [u64le(1), u64be(258i), u64le(9223372036854775807i), u64be(9007199254740991)])
t("u64 neg", fn() = u64le(-1i))
t("u64 unsafe", fn() = u64le(9007199254740992))
t("i32", fn() = [i32le(-1), i32le(-2147483648), i32le(2147483647)])
t("i32 big", fn() = i32le(2147483648))
t("i64", fn() = [i64le(-2i), i64le(-9223372036854775807i - 1i), i64le(-1)])
t("read", fn() = [read_u64be(u64be(1234567890123i), 0), read_u64be(from_hex("00" + "0000000000000102"), 1)])
t("read top", fn() = read_u64be(from_hex("8000000000000000"), 0))
t("read off", fn() = read_u64be(bytes([1, 2]), 0))
t("read neg", fn() = read_u64be(u64be(1), -1))
t("read frac", fn() = read_u64be(u64be(1), 0.5))
t("read i", fn() = read_u64be(u64be(1), 0i))
t("read s", fn() = read_u64be("x", 0))
t("wrap32", fn() = [wrap32(0), wrap32(-1), wrap32(4294967296), wrap32(4294967297), wrap32(-4294967297), wrap32(9007199254740991)])
t("wrap32 frac", fn() = wrap32(1.5))
t("wrap32 i", fn() = wrap32(1i))
t("wrap32 big", fn() = wrap32(9007199254740992))
t("rotl", fn() = [rotl(1, 0), rotl(1, 31), rotl(2147483648, 1), rotl(-1, 5), rotl(305419896, 8), rotr(1, 1), rotr(305419896, 8), rotr(5, 0)])
t("rot64", fn() = [rotl(1i, 63), rotl(-9223372036854775807i - 1i, 1), rotr(1i, 1), rotr(1i, 0i), rotl(1i, 64 - 1), rotl(81985529216486895i, 8)])
t("rot cnt", fn() = rotl(1, 32))
t("rot cnt i", fn() = rotl(1, 1i))
t("rot word", fn() = rotl(4294967296, 1))
t("rot neg", fn() = rotl(-2147483649, 1))
t("rot s", fn() = rotr("a", 1))
t("rot64 cnt", fn() = rotl(1i, 64))
t("rot64 frac", fn() = rotr(1i, 0.5))`,
  // ── 2026-10-31: fractional nums natively (GATE-NL-004): IEEE doubles, printed and parsed as the interpreter (JavaScript) does ──
  'fractional literals, arithmetic, printing and parsing': String.raw`print(0.1 + 0.2, 1 / 3, 2 / 3, 1e21, 1e-7, 123456789012345680000, -0.0, 5 % 2.5, -5.5 % 2, 9007199254740993, 1 / 4)
print(floor(-2.5), num("1.5e3"), num(" 0x10 "), int(2.0), 3 / 1.5, 7 / 2, 1.0 == 1, 0.1 * 3, 100 / 3)
try { print(int(2.5)) } else e { print(e.message) }
try { print(1 / 0) } else e { print(e.message) }
try { print(5 % 0.0) } else e { print(e.message) }
try { print(1.5 & 1) } else e { print(e.message) }
try { print([1, 2][0.5]) } else e { print(e.message) }
try { print(sqrt(2)) } else e { print(e.message) }
print(1e21, 1e-7, 5e-324, 1.7976931348623157e308, 2.5e3, 0.000001, 123456789012345680000, 1e400, 3.14159 * 2)`,
  'fractional nums from division, conversions, overflow to doubles, and every refusal': String.raw`let h = 1 / 2
let t = 1 / 10
print(h, t, t + t + t, 1 / 3, 2 / 3, 100 / 3, 7 / 2, h + h, type_of(h), h == 1 / 2, h + h == 1)
print(-h, 5 % (5 / 2), (-11 / 2) % 2, floor(-5 / 2), idiv(10 ** 15 * 10 ** 6, 3), h < t, t < h, min(h, t), max([t, h, 2]))
print(9007199254740992 + 1, 9007199254740992 * 3, 10 ** 15 * 10 ** 6 / 1)
print(num("1.5e3"), num(" 0x10 "), num("-0.25"), num("Infinity"), int(7 / 2), int(-7 / 2), str(1 / 8), repr([1 / 4]))
var big = 1
for i in 0..400 { big = big * 10 }
print(big, -big, big - big, int(1 / 3 * 3))
try { print(int(big)) } else e { print(e.message) }
try { print((1 / 2) & 1) } else e { print(e.message) }
try { print([1, 2][1 / 2]) } else e { print(e.message) }
try { print(1 / 0) } else e { print(e.message) }
try { print(h % 0) } else e { print(e.message) }
try { print(num("abc")) } else e { print(e.message) }
try { print(int(" +42 "), int("4.5")) } else e { print(e.message) }`,
};

let pass = 0, fail = 0;
let n = 0;
for (const [name, c] of Object.entries(CASES)) {
  const src = typeof c === 'string' ? c : c.src;
  const dir = path.join(TMP, 'c' + (++n));
  fs.mkdirSync(dir);
  const file = path.join(dir, 'main.eg');
  fs.writeFileSync(file, src + '\n');
  const ref = spawnSync(process.execPath, [EG, 'run', file], { encoding: 'utf8' });
  const exe = path.join(dir, 'main.bin');
  const build = spawnSync(process.execPath, [EG, 'native', file, '-o', exe], { encoding: 'utf8' });
  let problem = null;
  if (build.status !== 0) problem = 'native build failed: ' + (build.stderr || build.stdout).trim().split('\n')[0];
  else {
    const run = spawnSync(exe, [], { encoding: 'utf8' });
    if (typeof c === 'object' && c.code !== undefined && ref.status !== c.code) problem = `interpreter exited ${ref.status}, expected ${c.code}`;
    else if (run.stdout !== ref.stdout) problem = `stdout differs\n    interpreter: ${JSON.stringify(ref.stdout)}\n    native:      ${JSON.stringify(run.stdout)}`;
    else if (run.status !== ref.status) problem = `exit status ${run.status}, interpreter ${ref.status}`;
    else if (run.stderr !== ref.stderr) problem = `stderr differs\n    interpreter: ${JSON.stringify(ref.stderr)}\n    native:      ${JSON.stringify(run.stderr)}`;
  }
  if (problem) { fail++; console.log('✗ ' + name + ' — ' + problem); } else { pass++; console.log('✓ ' + name); }
}

// sha256 from the CPU (Nexus phase CIE2, CIE-EG CIE-004): FIPS 180-4's own answers, then every padding boundary against the interpreter
{
  const dir = path.join(TMP, 'sha256');
  fs.mkdirSync(dir);
  const src = [
    'print(hex(sha256("")))',
    'print(hex(sha256("abc")))',
    'print(hex(sha256("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")))',
    'print(hex(sha256("abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu")))',
    'var a = "a"',
    'for i in 0..20 { a = a + a }',
    'print(hex(sha256(slice(a, 0, 1000000))))',
    'for n in [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 1000] { print(n, hex(sha256(bytes(range(n))))) }',
    'print(hex(sha256("é ✓ 𝄞")))',
    'try { print(sha256(5)) } else e { print(e.message) }',
  ].join('\n') + '\n';
  const FIPS = [
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1',
    'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
  ];
  fs.writeFileSync(path.join(dir, 'main.eg'), src);
  const ref = spawnSync(process.execPath, [EG, 'run', path.join(dir, 'main.eg')], { encoding: 'utf8' });
  const exe = path.join(dir, 'main.bin');
  const build = spawnSync(process.execPath, [EG, 'native', path.join(dir, 'main.eg'), '-o', exe], { encoding: 'utf8' });
  const run = build.status === 0 ? spawnSync(exe, [], { encoding: 'utf8' }) : null;
  const lines = run ? run.stdout.split('\n') : [];
  const fips = FIPS.every((h, i) => lines[i] === h);
  if (run && fips && run.stdout === ref.stdout && run.status === ref.status) { pass++; console.log('✓ sha256 (FIPS 180-4 vectors, padding boundaries, refusal)'); }
  else { fail++; console.log('✗ sha256 — ' + (run ? (fips ? 'differs from the interpreter: ' + JSON.stringify(run.stdout) + ' vs ' + JSON.stringify(ref.stdout) : 'FIPS vectors wrong: ' + JSON.stringify(lines.slice(0, 5))) : (build.stderr || build.stdout))); }
}

// the ledger's format in Emerge (Nexus phase CIE3, lang/cie/ledger.eg): the independent known answers of ledger.test (a separate Python
// implementation of §4.2 and §4.6), a real run's ledger re-verified, a forged entry caught, and the text subset (D5) refused the same way
{
  const dir = path.join(TMP, 'ledger');
  fs.mkdirSync(dir);
  const LEDGER_EG = path.join(LANG, 'cie', 'ledger.eg');
  const JSON_EG = path.join(LANG, 'native', 'json.eg');
  fs.writeFileSync(path.join(dir, 'prog.eg'), [
    'contract demo_main {', '  version = "1.0.0"', '  gate { checkpoint_every = 5 }', '  road Counter.changed -> Display.show', '}',
    'component Counter {', '  id = "demo.counter"', '  namespace = "demo"', '  version = "1.0.0"', '  state { n: 0 }',
    '  in bump(x: { by: num }) {', '    state.n += x.by', '    emit out changed { count: state.n }', '  }', '  out changed: { count: num }', '}',
    'component Display {', '  id = "demo.display"', '  namespace = "demo"', '  version = "1.0.0"', '  in show(v: { count: num }) { print("count {v.count}") }', '}',
    'for i in range(6) { send Counter.bump { by: 0.5 } }', 'gap "a test gap — with its own punctuation" pressure 0.4 type logical', 'send Counter.bump { by: 1 }',
  ].join('\n') + '\n');
  const ledgerFile = path.join(dir, 'ledger.json');
  spawnSync(process.execPath, [EG, 'run', path.join(dir, 'prog.eg'), '--ledger', ledgerFile], { encoding: 'utf8' });
  const src = [
    `use ${JSON.stringify(LEDGER_EG)} as L`, `use ${JSON.stringify(JSON_EG)} as J`,
    'let e1 = { seq: 1, kind: "genesis", body: { seed: 0, version: "1.7.2", text: { normalization: "nfc", encoding: "utf-8" } }, prev: L.ZERO }',
    'let h1 = L.hash_entry(e1)',
    'let e2 = { seq: 2, kind: "note", body: { x: 1, "é": [true, null, "a\\"b\\n"] }, prev: h1 }',
    'let h2 = L.hash_entry(e2)',
    'let e3 = { seq: 3, kind: "note", body: { big: 9223372036854775807i }, prev: h2 }',
    'let h3 = L.hash_entry(e3)',
    'print(h1)', 'print(h2)', 'print(h3)',
    'print(L.merkle_root([h1]))', 'print(L.merkle_root([h1, h2, h3]))', 'print(L.merkle_root([]))',
    'let es = J.parse(read_file(args()[0]))',
    'var same = 0',
    'for e in es { if L.hash_entry(e) == e.hash { same += 1 } }',
    'print("entries", len(es), "rehashed", same, "verify", L.verify(es).ok)',
    'let hs = map(es, fn(e) = e.hash)',
    'print("proofs", all(range(len(hs)), fn(i) = L.merkle_fold(hs[i], L.merkle_proof(hs, i)) == L.merkle_root(hs)))',
    'var t = J.parse(read_file(args()[0]))', 't[2]["kind"] = "forged"', 'let r = L.verify(t)', 'print("forged", r.ok, r.seq, r.reason)',
    'try { print(L.ecf({ k: "～" })) } else e { print(e.message) }',
    'try { print(L.ecf("e" + utf8(bytes([0xCC, 0x81])))) } else e { print(e.message) }',
    'print(L.ecf({ b: 1, "→": 1, "é": 2, z: 3, q: "– — ‘ ’ “ ” … ─ ✓ ✗" }))',
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(dir, 'main.eg'), src);
  const ref = spawnSync(process.execPath, [EG, 'run', path.join(dir, 'main.eg'), ledgerFile], { encoding: 'utf8' });
  const exe = path.join(dir, 'main.bin');
  const build = spawnSync(process.execPath, [EG, 'native', path.join(dir, 'main.eg'), '-o', exe], { encoding: 'utf8' });
  const run = build.status === 0 ? spawnSync(exe, [ledgerFile], { encoding: 'utf8' }) : null;
  const L = require(path.join(LANG, 'ledger.js'));
  const es = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
  const want = [
    '04b037e1547c2ce22ff3ca14ffba18e38246b05590b86c93bfeefe76d6b158f7',
    'c0ebe12c6a09dfdc17fa8a3df75d457dae05d7a58658b725f6d3e1f8c3481b61',
    '0cb05ed671bcec5e9e4cefc83ef537f8bc9dbd7137b35a0ab70303f5625347f4',
    'f8d1a6bdd2e92b6da5486d0b3d33f9e4d4398c7e49191d00bc36b1a581fb5a9c',
    'a82a29ac215ae0e2b6d4c5cd34c75a0de4a6acdb5915c4396b172f6cdac43493',
    'ead4e0984ebf7eaf44723405667252a1eca1d5b1d3da97bb97be035163be8fca',
    `entries ${es.length} rehashed ${es.length} verify true`,
    'proofs true',
    'forged false 3 hash does not match the entry',
    "ledger: value.k holds U+FF5E, outside the ledger's text subset (CIE-EG D5: below U+0300 and – — ‘ ’ “ ” … → ─ ✓ ✗); the full NFC tables come later",
    "ledger: value holds U+0301, outside the ledger's text subset (CIE-EG D5: below U+0300 and – — ‘ ’ “ ” … → ─ ✓ ✗); the full NFC tables come later",
    L.ecf({ b: 1, '→': 1, 'é': 2, z: 3, q: '– — ‘ ’ “ ” … ─ ✓ ✗' }),
  ].join('\n') + '\n';
  const ok = run && L.verify(es).ok && es.some(e => /→/.test(JSON.stringify(e.body))) && run.stdout === want && ref.stdout === want && run.status === 0;
  if (ok) { pass++; console.log('✓ ledger (known answers, a real run re-verified, a forged entry, the text subset)'); }
  else { fail++; console.log('✗ ledger — ' + (run ? `native ${JSON.stringify(run.stdout)}\n    interp ${JSON.stringify(ref.stdout + ref.stderr)}\n    want   ${JSON.stringify(want)}` : (build.stderr || build.stdout))); }
}

// the world in Emerge (Nexus phase CIE4, slice a; lang/cie/world.eg): compartments, constraints (hard and soft), signals, a wildcard, a handler
// that sends, rejection, spent, unrouted and the closing checkpoint. world/counter.eg is run by the interpreter (lang/runtime.js);
// world/counter.world.eg is the same program on world.eg. Both must give the same output and the same ledger, hash for hash, interpreted and native.
{
  const W = path.join(__dirname, 'world');
  const ledgerFile = path.join(TMP, 'world-ref.json');
  const ref = spawnSync(process.execPath, [EG, 'run', path.join(W, 'counter.eg'), '--ledger', ledgerFile], { encoding: 'utf8' });
  const want = ref.stdout + JSON.parse(fs.readFileSync(ledgerFile, 'utf8')).map(e => `${e.seq} ${e.kind} ${e.hash}\n`).join('');
  const version = require(path.join(LANG, 'index.js')).VERSION;
  const interp = spawnSync(process.execPath, [EG, 'run', path.join(W, 'counter.world.eg'), version], { encoding: 'utf8' });
  const exe = path.join(TMP, 'world.bin');
  const build = spawnSync(process.execPath, [EG, 'native', path.join(W, 'counter.world.eg'), '-o', exe], { encoding: 'utf8' });
  const run = build.status === 0 ? spawnSync(exe, [version], { encoding: 'utf8' }) : null;
  const n = (want.match(/^\d+ \w+ [0-9a-f]{64}$/gm) || []).length;
  if (run && n >= 10 && interp.stdout === want && run.stdout === want && run.status === 0) { pass++; console.log(`✓ world (${n} ledger entries equal to the interpreter's, hash for hash, interpreted and native)`); }
  else { fail++; console.log('✗ world — ' + (run ? `native ${JSON.stringify(run.stdout)}\n    interp ${JSON.stringify(interp.stdout + interp.stderr)}\n    want   ${JSON.stringify(want)}` : (build.stderr || build.stdout))); }
}

// CIE4 slice b: counter.eg as written (compartment, constraints, on, emit, a wildcard, spent, ledger()) compiled natively; native/lower.eg turns
// it into world.eg calls. Its output and its ledger, printed at the end, equal the interpreter's, hash for hash.
{
  const file = path.join(__dirname, 'world', 'counter_ledger.eg');
  const ref = spawnSync(process.execPath, [EG, 'run', file], { encoding: 'utf8' });
  const exe = path.join(TMP, 'counter_ledger.bin');
  const build = spawnSync(process.execPath, [EG, 'native', file, '-o', exe], { encoding: 'utf8' });
  const run = build.status === 0 ? spawnSync(exe, [], { encoding: 'utf8' }) : null;
  const n = (ref.stdout.match(/^\d+ \w+ [0-9a-f]{64}$/gm) || []).length;
  if (run && n >= 9 && run.stdout === ref.stdout && run.status === 0) { pass++; console.log(`✓ compartments natively, as written (${n} ledger entries equal to the interpreter's)`); }
  else { fail++; console.log('✗ compartments natively — ' + (run ? `native ${JSON.stringify(run.stdout)}\n    interp ${JSON.stringify(ref.stdout)}` : (build.stderr || build.stdout))); }
}

// CIE14 (a): examples/counter.eg as the language ships it, lens functions and a write into a lens included, natively equal to the interpreter
// line for line: a lens is a frozen copy natively too (freeze, rt_b_freeze), and writing it raises the interpreter's read-only error.
{
  const file = path.join(LANG, 'examples', 'counter.eg');
  const ref = spawnSync(process.execPath, [EG, 'run', file], { encoding: 'utf8' });
  const exe = path.join(TMP, 'counter_example.bin');
  const build = spawnSync(process.execPath, [EG, 'native', file, '-o', exe], { encoding: 'utf8' });
  const run = build.status === 0 ? spawnSync(exe, [], { encoding: 'utf8' }) : null;
  const lens = /lens: this value is read-only/.test(ref.stdout);
  if (run && lens && run.stdout === ref.stdout && run.status === ref.status) { pass++; console.log('✓ examples/counter.eg natively, line for line (the frozen lens included)'); }
  else { fail++; console.log('✗ examples/counter.eg natively — ' + (run ? `native ${JSON.stringify(run.stdout)}\n    interp ${JSON.stringify(ref.stdout)}` : (build.stderr || build.stdout))); }
}

// modules: use across files, with globals and functions on both sides
{
  const dir = path.join(TMP, 'mods');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'lib.eg'), 'var hits = 0\nlet greeting = "hi"\nfn twice(x) {\n  hits += 1\n  return x + x\n}\nfn count() { return hits }\n');
  fs.writeFileSync(path.join(dir, 'main.eg'), 'use "./lib.eg" as lib\nprint(lib.greeting, lib.twice(3), lib.twice("ab"), lib.count(), lib.hits)\n');
  const ref = spawnSync(process.execPath, [EG, 'run', path.join(dir, 'main.eg')], { encoding: 'utf8' });
  const exe = path.join(dir, 'main.bin');
  const build = spawnSync(process.execPath, [EG, 'native', path.join(dir, 'main.eg'), '-o', exe], { encoding: 'utf8' });
  const run = build.status === 0 ? spawnSync(exe, [], { encoding: 'utf8' }) : null;
  if (run && run.stdout === ref.stdout && run.status === ref.status) { pass++; console.log('✓ modules'); }
  else { fail++; console.log('✗ modules — ' + (run ? JSON.stringify(run.stdout) + ' vs ' + JSON.stringify(ref.stdout) : (build.stderr || build.stdout))); }
}

// args: the program's own arguments
{
  const dir = path.join(TMP, 'args');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'main.eg'), 'print(args(), len(args()))\n');
  const ref = spawnSync(process.execPath, [EG, 'run', path.join(dir, 'main.eg'), 'one', 'twö'], { encoding: 'utf8' });
  const exe = path.join(dir, 'main.bin');
  spawnSync(process.execPath, [EG, 'native', path.join(dir, 'main.eg'), '-o', exe], { encoding: 'utf8' });
  const run = spawnSync(exe, ['one', 'twö'], { encoding: 'utf8' });
  if (run.stdout === ref.stdout) { pass++; console.log('✓ args'); } else { fail++; console.log('✗ args — ' + JSON.stringify(run.stdout) + ' vs ' + JSON.stringify(ref.stdout)); }
}

// deterministic: one input, one file
{
  const a = path.join(TMP, 'det1'), b = path.join(TMP, 'det2');
  const f = path.join(TMP, 'c1', 'main.eg');
  spawnSync(process.execPath, [EG, 'native', f, '-o', a]);
  spawnSync(process.execPath, [EG, 'native', f, '-o', b]);
  const same = fs.readFileSync(a).equals(fs.readFileSync(b));
  if (same) { pass++; console.log('✓ same source, byte-identical executable'); } else { fail++; console.log('✗ output is not deterministic'); }
}

// refusals name the thing and exit 1; nothing is silently skipped
{
  const REFUSE = {
    'a component (CIE4 slice c, next)': 'component A {\n  id = "cm.a"\n  namespace = "a"\n  version = "1.0.0"\n  state { n: 0 }\n}',
  };
  for (const [what, src] of Object.entries(REFUSE)) {
    const file = path.join(TMP, 'refuse.eg');
    fs.writeFileSync(file, src + '\n');
    const r = spawnSync(process.execPath, [EG, 'native', file, '-o', path.join(TMP, 'refuse.bin')], { encoding: 'utf8' });
    if (r.status === 1 && /native:|error/.test(r.stderr + r.stdout)) { pass++; console.log('✓ refuses ' + what + ' by name'); }
    else { fail++; console.log('✗ did not refuse ' + what + ' (exit ' + r.status + ')'); }
  }
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
