jest.mock('axios',()=>({__esModule:true,default:{get:jest.fn(),create:jest.fn(()=>({post:jest.fn().mockResolvedValue({data:{ticket:'local'}})}))}}));

test('explicit local preview never refreshes production sessions or sends platform credentials',async()=>{
  const previous=process.env.IDE_LOCAL_PREVIEW;
  const previousApi=process.env.REACT_APP_BOT_API_URL;
  process.env.IDE_LOCAL_PREVIEW='1';
  process.env.REACT_APP_BOT_API_URL='https://api.innoprog.ru';
  global.fetch=jest.fn();
  window.history.replaceState({},'', '/?roomId=some-room#platform_auth=private');
  try {
    let api:any;
    let axios:any;
    jest.isolateModules(()=>{api=require('./api').api;axios=require('axios').default;});
    await api.consoleTicket();
    await api.runCode({program:'print(1)'},'py');
    const client=axios.create.mock.results[0].value;
    expect(axios.create.mock.calls[0][0].baseURL).toBe('/bot-api');
    expect(client.post.mock.calls[0][2].headers).toEqual({});
    expect(client.post.mock.calls[1][2].headers).toEqual({'Content-Type':'application/json'});
    expect(api.consoleSocketUrl()).toMatch(/^ws:\/\/localhost\/bot-api\/code\/console\/v1\/ws$/);
    expect(global.fetch).not.toHaveBeenCalled();
  } finally {
    if(previous===undefined)delete process.env.IDE_LOCAL_PREVIEW;else process.env.IDE_LOCAL_PREVIEW=previous;
    if(previousApi===undefined)delete process.env.REACT_APP_BOT_API_URL;else process.env.REACT_APP_BOT_API_URL=previousApi;
    window.history.replaceState({},'','/');
  }
});
