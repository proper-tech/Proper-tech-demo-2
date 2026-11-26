import struct,sys
def varint(b,i):
    r=s=0
    while True:
        c=b[i];i+=1;r|=(c&0x7f)<<s;s+=7
        if c<128:return r,i
def parse(b):
    i=0;out=[]
    while i<len(b):
        k,i=varint(b,i);f,t=k>>3,k&7
        if t==0:v,i=varint(b,i)
        elif t==1:v=struct.unpack('<d',b[i:i+8])[0];i+=8
        elif t==5:v=struct.unpack('<f',b[i:i+4])[0];i+=4
        elif t==2:
            n,i=varint(b,i);v=b[i:i+n];i+=n
            try:v=parse(v)
            except Exception:pass
        else:raise ValueError
        out.append((f,t,v))
    return out
def show(x,ind=''):
    for f,t,v in x:
        if isinstance(v,list):print(ind+str(f)+':');show(v,ind+'  ')
        else:print(ind+f'{f}[{t}]={v!r}'[:120])
