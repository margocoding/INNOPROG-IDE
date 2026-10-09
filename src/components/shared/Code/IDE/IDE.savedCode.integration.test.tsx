import { render, waitFor } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { api } from "../../../../services/api";
import IDE from "./IDE";
jest.mock("@heroui/react", () => ({
  useDisclosure: () => ({ isOpen: false, onOpen: jest.fn(), onOpenChange: jest.fn(), onClose: jest.fn() }),
  Select: ({ children, onChange, ...p }: any) => <select aria-label={p["aria-label"]} onChange={onChange}>{typeof children === "function" ? null : children}</select>,
  SelectItem: ({ children }: any) => <option>{children}</option>,
}));
jest.mock("../../../../services/api", () => ({ api: { getTask: jest.fn(), getSubmitCode: jest.fn() } }));
jest.mock("../../../../hooks/useCodeExecution", () => ({ useCodeExecution: () => ({ isRunning: false, handleRunCode: jest.fn(), onSendCheck: jest.fn(), setCurrentCode: jest.fn() }) }));
jest.mock("../TaskDescription/TaskDescription", () => () => null);
jest.mock("../OutputSection/OutputSection", () => () => null);
jest.mock("../SubmitModal/SubmitModal", () => () => null);
jest.mock("../../Header/Header", () => () => null);
jest.mock("../../Footer/Footer", () => () => null);
jest.mock("../../Room/StartFormModal/StartFormModal", () => () => null);
function documentCode(container: HTMLElement) {
  const element=container.querySelector(".cm-editor");
  return element ? EditorView.findFromDOM(element)?.state.doc.toString() : null;
}
beforeEach(() => {
  jest.clearAllMocks(); localStorage.clear();
  (global as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.history.replaceState({}, "", "/?client_id=123&task_id=10006&answer_id=diagnostic&lang=py&platforma=app");
});
it("hydrates saved code into the real standalone CodeMirror editor", async () => {
  (api.getTask as jest.Mock).mockResolvedValue({id:10006,title:"Task",answers:[{code_before:"",code_after:""}],task_type:"code"});
  (api.getSubmitCode as jest.Mock).mockResolvedValue({status:"success",has_saved_code:true,code:"print('previous solution')"});
  const {container}=render(<IDE telegramId="123" />);
  await waitFor(() => expect(documentCode(container)).toContain("print('previous solution')"));
});

it("restores saved code when a direct task link has no answer_id", async () => {
  window.history.replaceState({}, "", "/?client_id=123&task_id=10006&lang=py&platforma=app");
  (api.getTask as jest.Mock).mockResolvedValue({id:10006,title:"Task",answers:[{code_before:"",code_after:""}],task_type:"code"});
  (api.getSubmitCode as jest.Mock).mockResolvedValue({status:"success",has_saved_code:true,code:"print('saved direct link')"});
  const {container}=render(<IDE telegramId="123" />);
  await waitFor(() => expect(documentCode(container)).toContain("print('saved direct link')"));
  expect(api.getSubmitCode).toHaveBeenCalledWith(expect.any(String),123,10006);
});
it("restores the selected task code after standalone task navigation", async () => {
  (api.getTask as jest.Mock).mockImplementation(async (id) => ({id:Number(id),title:"Task",answers:[{code_before:"",code_after:""}],task_type:"code"}));
  (api.getSubmitCode as jest.Mock).mockImplementation(async (_answer,_user,id) => ({status:"success",has_saved_code:true,code:`print(${id})`}));
  const {container,rerender}=render(<IDE telegramId="123" />);
  await waitFor(() => expect(documentCode(container)).toContain("print(10006)"));
  window.history.replaceState({}, "", "/?client_id=123&task_id=10007&answer_id=next&lang=py&platforma=app");
  // Router context triggers this render in the app; the test router reads the
  // URL directly, so change an unused prop to pass through React.memo.
  rerender(<IDE telegramId="" />);
  await waitFor(() => expect(documentCode(container)).toContain("print(10007)"));
  expect(documentCode(container)).not.toContain("print(10006)");
});
