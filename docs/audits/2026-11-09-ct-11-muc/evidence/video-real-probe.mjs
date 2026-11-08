import {createVideoService} from '/app/src/services/videoService.js';
import {createVideoOptimizer} from '/app/src/services/videoOptimizer.js';
import {loadConfig} from '/app/src/config/index.js';
import {writeFile,rm,mkdtemp} from 'node:fs/promises';
const logger={info(){},warn(){},error(){}};const video=createVideoService({config:loadConfig(),logger});const optimizer=createVideoOptimizer({assets:{},storage:{},video,logger,tmpDir:'/tmp'});
const dir=await mkdtemp('/tmp/ct-video-');
try{const fake=Buffer.alloc(64);fake.write('ftypisom',4);await writeFile(dir+'/invalid.mp4',fake);const bad=await optimizer.inspect(dir+'/invalid.mp4');const valid=await optimizer.inspect('/app/test/fixtures/tiny.mp4',{wantPoster:true});const bytes=await video.transcode('/app/test/fixtures/tiny.mp4',dir+'/out.mp4',{hasAudio:false,duration:valid.info.duration});console.log(JSON.stringify({case:'real-video-tools',invalidBroken:bad.broken,validCodec:valid.info.vcodec,posterBytes:valid.poster?.length,transcodedBytes:bytes}));}finally{await rm(dir,{recursive:true,force:true});}
