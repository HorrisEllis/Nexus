// NEXUS — JAA FileStore
// Content-addressable. SHA256. Atomic write. Dedup.
'use strict';
const crypto=require('crypto'),fs=require('fs'),path=require('path');
class FileStore{
  constructor(base='./data/store'){this._base=base;['objects','refs'].forEach(d=>fs.mkdirSync(path.join(base,d),{recursive:true}))}
  async put(content){const buf=Buffer.isBuffer(content)?content:Buffer.from(JSON.stringify(content));const hash=this._sha256(buf);const dest=this._obj(hash);if(fs.existsSync(dest))return hash;const tmp=`${dest}.tmp.${process.pid}`;await fs.promises.writeFile(tmp,buf);await fs.promises.rename(tmp,dest);return hash}
  async get(hash){const p=this._obj(hash);if(!fs.existsSync(p))return null;const b=await fs.promises.readFile(p);try{return JSON.parse(b.toString())}catch{return b}}
  has(hash){return fs.existsSync(this._obj(hash))}
  _sha256(buf){return crypto.createHash('sha256').update(buf).digest('hex')}
  _obj(hash){const dir=path.join(this._base,'objects',hash.slice(0,2));fs.mkdirSync(dir,{recursive:true});return path.join(dir,hash.slice(2))}
}
// FileRefs has moved to foundation/store/FileRefs.js
module.exports = { FileStore };
