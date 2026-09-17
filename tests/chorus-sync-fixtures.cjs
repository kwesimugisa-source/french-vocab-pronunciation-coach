const { environment, deferred, load } = require("./playback-fixtures.cjs");
function pcm(lead = 0.1, active = 2, tail = 0.1, channels = 1) {
  const sampleRate = 1000, length = Math.round((lead + active + tail) * sampleRate);
  const data = Array.from({length:channels}, () => new Float32Array(length));
  data[channels-1].fill(0.1, Math.round(lead*sampleRate), Math.round((lead+active)*sampleRate));
  return {sampleRate, length, duration:length/sampleRate, numberOfChannels:channels, getChannelData:i=>data[i]};
}
function webEnvironment(buffers = [pcm(.05,2),pcm(.28,2.12),pcm(.48,1.9)]) {
  const env = environment(), contexts = [], nodes = [], gains = [], decodes = [], timing = new Map();
  let decodeCount=0;
  Object.assign(env, {contexts,nodes,gains,decodes,holdDecode:false,resumeResult:null,failStart:0,failCreate:0,
    get decodeCount() { return decodeCount; },
    createChorusContext() {
      const context = {currentTime:10,state:"suspended",destination:{},onstatechange:null,closed:0,
        decodeAudioData() { const i=decodeCount++; const d=deferred(); decodes.push(d);
          return env.holdDecode ? d.promise : Promise.resolve(buffers[i % buffers.length]); },
        resume() { if(env.resumeResult) return env.resumeResult; this.state="running"; return Promise.resolve(); },
        close() {this.closed++; this.state="closed"; return Promise.resolve();},
        createBufferSource() {
          if(env.failCreate && nodes.length+1===env.failCreate) throw new Error("create source failed");
          const node={context,buffer:null,playbackRate:{value:1},onended:null,starts:[],stops:0,disconnects:0,
            connect(){},disconnect(){this.disconnects++;},stop(){this.stops++;},
            start(...args){ if(env.failStart && nodes.indexOf(this)+1===env.failStart) throw new Error("start failed"); this.starts.push(args); },
            end(){this.onended?.(new Event("ended"));},
          }; nodes.push(node); return node;
        },
        createGain(){const gain={gain:{value:0},connect(){},disconnects:0,disconnect(){this.disconnects++;}};gains.push(gain);return gain;},
      };contexts.push(context);return context;
    },
  });
  // Object.assign evaluates getters; expose the counter after assignment.
  Object.defineProperty(env,"decodeCount",{get:()=>decodeCount});
  const set=env.setTimer,clear=env.clearTimer;
  env.setTimer=(fn,ms)=>{const id=set(fn);timing.set(id,ms);return id;};
  env.clearTimer=id=>{clear(id);timing.delete(id);};
  env.runTimers=ms=>{for(const [id,fn] of [...env.timers])if(timing.get(id)===ms){env.clearTimer(id);fn();}};
  return env;
}
const settle = async () => {for(let i=0;i<40;i++)await Promise.resolve();};
const text="LE CHŒUR :\n\nEnsemble, gardons notre espoir.\nNORA: Bonjour.";
async function setup(env=webEnvironment(), source=text) {
  const { generateTheatreResponse }=load("lib/theatre-generation.ts");
  const { TheatrePlaybackController }=load("lib/theatre-playback.ts");
  let generation=0;
  const data=await generateTheatreResponse(source,1,async()=>{generation++;return "YQ==";});
  const controller=new TheatrePlaybackController(env);
  controller.acceptScene(controller.beginLoading(),data,source);await settle();
  return {env,controller,data,generation};
}
module.exports={pcm,webEnvironment,settle,setup,text,load,deferred};
