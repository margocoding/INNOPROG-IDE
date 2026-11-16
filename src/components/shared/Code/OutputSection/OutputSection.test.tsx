import { fireEvent, render, screen, within } from "@testing-library/react";
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

  it("shows SQLite expressions and aliases, preserves cells, and keeps empty result headers", () => {
    render(
      <OutputSection
        output=""
        status="idle"
        activeTab="output"
        language="sql"
        sqlResults={[
          {
            columns: ["price*quantity", "total", "title"],
            rows: [["2840.5", "2840.5", "a,b;c"], ["0", "0007", null]],
            numeric_columns: [[0, 1], [0]],
          },
          { columns: ["Количество"], rows: [] },
        ]}
      />,
    );
    const [first, second] = screen.getAllByRole("table");
    expect(within(first).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(
      ["price*quantity", "total", "title"],
    );
    expect(within(first).getByRole("cell", { name: "a,b;c" })).toBeInTheDocument();
    expect(within(first).getByRole("cell", { name: "0", exact: true })).toHaveClass("ide-sql-number");
    expect(within(first).getByRole("cell", { name: "0007" })).not.toHaveClass("ide-sql-number");
    expect(within(first).getByRole("cell", { name: "NULL" })).toBeInTheDocument();
    expect(within(second).getByRole("columnheader", { name: "Количество" })).toBeInTheDocument();
    expect(screen.getByText("Нет строк")).toBeInTheDocument();
    expect(screen.queryByText("Нет результата")).not.toBeInTheDocument();
  });

  it("pages through long SQLite results and starts new results on the first page", () => {
    const props = { output: "", status: "idle", activeTab: "output", language: "sql" } as const;
    const result = { columns: ["n"], rows: Array.from({ length: 101 }, (_, i) => [String(i + 1)]) };
    const { rerender } = render(<OutputSection {...props} sqlResults={[result]} />);
    expect(screen.queryByRole("cell", { name: "101" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Дальше" }));
    expect(screen.getByRole("cell", { name: "101" })).toBeInTheDocument();
    rerender(<OutputSection {...props} sqlResults={[{ ...result }]} />);
    expect(screen.getByRole("cell", { name: "1" })).toBeInTheDocument();
  });

  it("hides output while the desktop task editor is active", () => {
    render(
      <OutputSection
        output=""
        status="idle"
        activeTab="editor"
        desktopSinglePane
      />,
    );
    expect(screen.getByText("Output").closest(".h-full.min-w-0")).toHaveClass(
      "hidden",
    );
  });

  it("sizes task output as the lower desktop pane", () => {
    render(
      <OutputSection
        output="done"
        status="success"
        activeTab="output"
        desktopStackedPane
      />,
    );
    const pane = screen.getByText("Output").closest(".h-full.min-w-0");
    expect(pane).toHaveClass("desktop-task-output-pane");
    expect(pane).toHaveStyle("width: 100%");
  });
});
