import {createIntentService} from './intent-service.mjs';
let handler,key;
export default {fetch(request,env){if(!handler||key!==env.OPENAI_API_KEY){key=env.OPENAI_API_KEY;handler=createIntentService(env);}return handler(request,request.headers.get('CF-Connecting-IP')||'anonymous');}};
