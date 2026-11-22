#!/usr/bin/env python3
"""Validate copied records without running or displaying their contents."""
import sys,json,zipfile,hashlib,stat
from pathlib import Path,PurePosixPath

def inspect(archive,output=None):
    with zipfile.ZipFile(archive) as z:
        entries=z.infolist()
        names=[e.filename for e in entries]
        if len(names)!=len(set(names)) or len(names)>12002: raise ValueError('Duplicate/too many entries')
        if sum(e.file_size for e in entries)>270*1024*1024: raise ValueError('Size limit')
        for e in entries:
            path=PurePosixPath(e.filename)
            if path.is_absolute() or '..' in path.parts or str(path)!=e.filename or '\\' in e.filename or stat.S_ISLNK(e.external_attr>>16): raise ValueError('Unsafe entry')
        if json.loads(z.read('complete.json')).get('complete') is not True: raise ValueError('Incomplete copy')
        manifest=json.loads(z.read('manifest.json'))
        expected={'complete.json','manifest.json'}
        for item in manifest['files']:
            name='storage/'+item['path']; expected.add(name)
            data=z.read(name)
            if len(data)!=item['size'] or hashlib.sha256(data).hexdigest()!=item['sha256']: raise ValueError('Hash mismatch')
        if set(names)!=expected or len(manifest['files'])!=len(expected)-2: raise ValueError('Unexpected/duplicate files')
        if output:
            root=Path(output).resolve()
            # Resolve every destination before creating anything. This also blocks
            # Windows drive-qualified components inside an otherwise relative ZIP path.
            destinations=[root.joinpath(*PurePosixPath(e.filename).parts).resolve() for e in entries]
            if any(not dst.is_relative_to(root) or dst==root for dst in destinations): raise ValueError('Unsafe extraction destination')
            root.mkdir(mode=0o700,parents=False,exist_ok=False)
            for e in entries:
                dst=root.joinpath(*PurePosixPath(e.filename).parts)
                dst.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
                with dst.open('xb') as f: dst.chmod(0o600); f.write(z.read(e))
        return {'complete':True,'files':len(manifest['files']),'bytes':sum(x['size'] for x in manifest['files']),'originalStorageModified':False}
if __name__=='__main__':
    try:
        print(json.dumps(inspect(sys.argv[1],sys.argv[2] if len(sys.argv)>2 else None),indent=2))
    except Exception as e:
        print('Recovery archive rejected: '+str(e),file=sys.stderr);sys.exit(1)
