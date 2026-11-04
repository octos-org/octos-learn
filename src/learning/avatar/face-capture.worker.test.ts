import { afterEach, beforeEach, expect, it, vi } from "vitest";
const model=vi.hoisted(()=>({faceCreate:vi.fn(),poseCreate:vi.fn(),handCreate:vi.fn()}));
vi.mock("@mediapipe/tasks-vision",()=>({FilesetResolver:{forVisionTasks:async()=>({})},FaceLandmarker:{createFromOptions:model.faceCreate},PoseLandmarker:{createFromOptions:model.poseCreate},HandLandmarker:{createFromOptions:model.handCreate}}));
let worker: {onmessage: ((event: MessageEvent)=>Promise<void>) | null; postMessage: ReturnType<typeof vi.fn>};
const face={detectForVideo:vi.fn(()=>({faceBlendshapes:[],facialTransformationMatrixes:[]})),close:vi.fn()};
const pose={detectForVideo:vi.fn(()=>({landmarks:[]})),close:vi.fn()};
const hands={detectForVideo:vi.fn(()=>({landmarks:[],handedness:[]})),close:vi.fn()};
const send=async(data:unknown)=>worker.onmessage!({data} as MessageEvent);
beforeEach(async()=>{
  vi.resetModules();vi.clearAllMocks();face.detectForVideo.mockImplementation(()=>({faceBlendshapes:[],facialTransformationMatrixes:[]}));pose.detectForVideo.mockImplementation(()=>({landmarks:[]}));hands.detectForVideo.mockImplementation(()=>({landmarks:[],handedness:[]}));
  model.faceCreate.mockResolvedValue(face);model.poseCreate.mockResolvedValue(pose);model.handCreate.mockResolvedValue(hands);
  worker={onmessage:null,postMessage:vi.fn()};vi.stubGlobal("self",worker);await import("./face-capture.worker");
});
afterEach(()=>vi.unstubAllGlobals());
it("only loads body detectors when requested",async()=>{
  await send({type:"init",assetRoot:"/local"});expect(model.poseCreate).not.toHaveBeenCalled();expect(model.handCreate).not.toHaveBeenCalled();expect(worker.postMessage).toHaveBeenCalledWith({type:"ready"});
});
it("keeps face capture usable when a body model fails and closes partial resources",async()=>{
  model.handCreate.mockRejectedValue(new Error("missing"));await send({type:"init",assetRoot:"/local",body:true});
  expect(pose.close).toHaveBeenCalledOnce();expect(worker.postMessage).toHaveBeenCalledWith({type:"body_state",state:"failed"});expect(worker.postMessage).toHaveBeenCalledWith({type:"ready"});
});
it("samples body at most 10 Hz, independently of a visible face, and closes bitmaps",async()=>{
  await send({type:"init",assetRoot:"/local",body:true});
  const image={width:640,height:480,close:vi.fn()};
  for(const timeMs of [0,50,100])await send({type:"frame",image,timeMs});
  expect(face.detectForVideo).toHaveBeenCalledTimes(3);expect(pose.detectForVideo).toHaveBeenCalledTimes(2);expect(hands.detectForVideo).toHaveBeenCalledTimes(2);expect(image.close).toHaveBeenCalledTimes(3);
  const frame=worker.postMessage.mock.calls.find(([m])=>m.type==="frame")![0].frame;
  expect(frame.tracked).toBe(false);expect(frame.body).toBeDefined();expect(frame.body.left.gesture).toBe("relaxed");expect(frame.landmarks).toBeUndefined();
});
it("falls back to face tracking on a body inference failure",async()=>{
  await send({type:"init",assetRoot:"/local",body:true});pose.detectForVideo.mockImplementation(()=>{throw new Error("inference");});
  const image={width:640,height:480,close:vi.fn()};await send({type:"frame",image,timeMs:0});await send({type:"frame",image,timeMs:100});
  expect(pose.close).toHaveBeenCalledOnce();expect(hands.close).toHaveBeenCalledOnce();expect(face.detectForVideo).toHaveBeenCalledTimes(2);
  expect(worker.postMessage).toHaveBeenCalledWith({type:"body_state",state:"failed"});expect(worker.postMessage.mock.calls.some(([m])=>m.type==="error")).toBe(false);
});
