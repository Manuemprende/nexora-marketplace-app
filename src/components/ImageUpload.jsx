import React,{useState} from 'react';
import {Upload,ImagePlus} from 'lucide-react';
import {api} from '../services/api';
export default function ImageUpload({value,onChange,onBusy}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState(null);
 async function upload(e){const file=e.target.files[0];if(!file)return;setError('');setResult(null);if(file.size>12*1024*1024){setError('La imagen debe pesar como máximo 12 MB');e.target.value='';return;}
 setBusy(true);onBusy(true);try{
 const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('No se pudo leer el archivo'));reader.readAsDataURL(file);});
 const image=await api('/images',{method:'POST',body:{data}});onChange(image.url);setResult(image);
 }catch(e){setError(e.message);}finally{setBusy(false);onBusy(false);e.target.value='';}}
 return <div className="productImageUpload"><div className="uploadPreview">{value?<img src={value} alt="Vista previa del producto"/>:<ImagePlus size={30}/>}</div><div className="grow"><b>Imagen del producto</b><p>PNG, JPG o WebP · Hasta 12 MB</p><label className={'outline imageUploadButton '+(busy?'disabled':'')}><Upload size={16}/>{busy?'Optimizando imagen…':value?'Cambiar imagen':'Subir imagen'}<input aria-label="Subir imagen del producto" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={upload}/></label>{result&&<small className="green" role="status">WebP guardada · {Math.ceil(result.stored_bytes/1024)} KB · {result.width} × {result.height} px</small>}{value&&!busy&&<button type="button" className="link" onClick={()=>{onChange('');setResult(null);}}>Quitar imagen</button>}{error&&<p className="formError" role="alert">{error}</p>}</div></div>;
}
