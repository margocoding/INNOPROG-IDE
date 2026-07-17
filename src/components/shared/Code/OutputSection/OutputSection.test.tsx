import { render, screen } from "@testing-library/react";
import OutputSection from "./OutputSection";

describe("OutputSection", () => {
  it("shows input, output and success state", () => {
    render(
      <OutputSection
        output="done"
        inputData="input"
        status="success"
        activeTab="output"
      />,
    );
    expect(screen.getByText("Входные данные")).toBeInTheDocument();
    expect(screen.getByText("done")).toHaveClass("text-green-500");
  });

  it("shows errors, empty output and an HTML sandbox", () => {
    const { rerender } = render(
      <OutputSection output="" status="error" activeTab="editor" />,
    );
    expect(screen.getByText("Нет результата")).toHaveClass("error-output");
    rerender(
      <OutputSection
        output=""
        status="idle"
        activeTab="editor"
        language="html"
        htmlPreview="<h1>Hello</h1>"
      />,
    );
    expect(screen.getByTitle("HTML Preview")).toHaveAttribute("srcDoc", "<h1>Hello</h1>");
  });
});
