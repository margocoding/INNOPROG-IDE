import {
	processTaskDescription,
	stripInlineIdeFormattingHint,
} from "./TaskDescription.utils";
import { fireEvent, render, screen } from "@testing-library/react";
import TaskDescription from "./TaskDescription";

jest.mock("../../../../index", () => ({ isDesktop: () => true }));

describe("processTaskDescription", () => {
	it("removes inline IDE monospace formatting hint from task descriptions", () => {
		const description = `Реализуйте функцию

❗ При отправке кода текстом, примените форматирование Моноширинный к коду

Проверьте результат`;

		expect(stripInlineIdeFormattingHint(description)).toBe(
			"Реализуйте функцию\n\nПроверьте результат"
		);

		const processed = processTaskDescription(description);
		expect(processed).toContain("Реализуйте функцию");
		expect(processed).toContain("Проверьте результат");
		expect(processed).not.toContain("При отправке кода текстом");
		expect(processed).not.toContain("Моноширинный");
	});

	it("removes inline IDE monospace formatting hint when the keyword is formatted as html", () => {
		const description =
			"<p>Условие задания</p><p>❗ При отправке кода текстом, примените форматирование <b>Моноширинный</b> к коду</p>";

		const processed = processTaskDescription(description);

		expect(processed).toBe("<p>Условие задания</p>");
		expect(processed).not.toContain("При отправке");
	});

	it("keeps escaped html tags visible in task text", () => {
		const description =
			"напишите код HTML для подключения JS файла. Используйте тег &lt;script&gt;";

		expect(processTaskDescription(description)).toBe(
			"Напишите код HTML для подключения JS файла. Используйте тег &lt;script&gt;"
		);

		const container = document.createElement("div");
		container.innerHTML = processTaskDescription(description);
		expect(container.textContent).toContain("Используйте тег <script>");
		expect(container.querySelector("script")).not.toBeInTheDocument();
	});

	it("keeps double-escaped html tags visible in task text", () => {
		const description = "используйте тег &amp;lt;script&amp;gt;";

		expect(processTaskDescription(description)).toBe(
			"Используйте тег &lt;script&gt;"
		);
	});

	it("renders paired safe html tags", () => {
		const description = "это <b>важно</b>";
		const container = document.createElement("div");

		container.innerHTML = processTaskDescription(description);

		expect(container.textContent).toBe("Это важно");
		expect(container.querySelector("b")).toHaveTextContent("важно");
	});

	it("preserves existing paired html formatting tags", () => {
		const description = "<p>условие</p>\nследующая строка";

		expect(processTaskDescription(description)).toBe(
			"<p>Условие</p><br>следующая строка"
		);
	});

	it("keeps one-line code as inline monospace code", () => {
		const description = "используйте <code>while</code>";
		const container = document.createElement("div");

		container.innerHTML = processTaskDescription(description);

		expect(container.textContent).toBe("Используйте while");
		expect(container.querySelector("pre")).not.toBeInTheDocument();
		expect(container.querySelector("code")).toHaveTextContent("while");
	});

	it("renders multiline code as a code block and preserves indentation", () => {
		const description = `имеется код:
<code>
for (i = 0; i &lt; 10; i++) {
    console.log(i)
}
</code>
перепишите код`;
		const container = document.createElement("div");

		container.innerHTML = processTaskDescription(description);

		const pre = container.querySelector("pre");
		const code = container.querySelector("pre code");

		expect(pre).not.toBeNull();
		expect(code).toHaveClass("language-javascript");
		expect(code?.textContent).toBe(
			"for (i = 0; i < 10; i++) {\n    console.log(i)\n}"
		);
		expect(code?.querySelector(".token.keyword")).toHaveTextContent("for");
		expect(
			Array.from(code?.querySelectorAll(".token.operator") || []).some(
				(token) => token.textContent === "<"
			)
		).toBe(true);
		expect(pre?.innerHTML).not.toContain("<br>");
	});

	it("keeps unpaired tags visible as text", () => {
		const description = "используйте тег <script>";
		const container = document.createElement("div");

		container.innerHTML = processTaskDescription(description);

		expect(container.textContent).toBe("Используйте тег <script>");
		expect(container.querySelector("script")).not.toBeInTheDocument();
	});

	it("keeps unclosed safe tags visible as text", () => {
		const description = "это <b>важно";
		const container = document.createElement("div");

		container.innerHTML = processTaskDescription(description);

		expect(container.textContent).toBe("Это <b>важно");
		expect(container.querySelector("b")).not.toBeInTheDocument();
	});

	it("escapes dangerous paired tags", () => {
		const description = "код <script>alert(1)</script>";
		const container = document.createElement("div");

		container.innerHTML = processTaskDescription(description);

		expect(container.textContent).toBe("Код <script>alert(1)</script>");
		expect(container.querySelector("script")).not.toBeInTheDocument();
	});

	it("removes dangerous attributes from safe tags", () => {
		const description = '<b onclick="alert(1)">важно</b>';
		const container = document.createElement("div");

		container.innerHTML = processTaskDescription(description);

		expect(container.innerHTML).toBe("<b>Важно</b>");
		expect(container.querySelector("b")).not.toHaveAttribute("onclick");
	});

	it("removes javascript urls from links", () => {
		const description = '<a href="javascript:alert(1)">ссылка</a>';
		const container = document.createElement("div");

		container.innerHTML = processTaskDescription(description);

		expect(container.innerHTML).toBe("<a>Ссылка</a>");
		expect(container.querySelector("a")).not.toHaveAttribute("href");
	});
});

describe("TaskDescription component", () => {
	it("renders the single public sample input/output and safely resizes", () => {
		const { container } = render(
			<TaskDescription
				task={{
					description: "решите задачу",
					has_multiple_tests: true,
					answers: [{ input: "1", output: "2" }],
				} as any}
			/>
		);
		expect(screen.getByText("Решите задачу")).toBeInTheDocument();
		expect(screen.getByText("Входные данные:")).toHaveClass("mt-3");
		const outer = container.querySelector(".bg-ide-secondary") as HTMLElement;
		jest.spyOn(outer, "getBoundingClientRect").mockReturnValue({
			top: 10,
		} as DOMRect);
		const handle = outer.lastElementChild as HTMLElement;
		fireEvent.mouseDown(handle);
		fireEvent.mouseMove(document, { clientY: 310 });
		expect(outer.style.height).toBe("300px");
		fireEvent.mouseUp(document);
	});

	it("does not expose the only test of a regular code task", () => {
		render(
			<TaskDescription
				task={{
					description: "решите задачу",
					task_type: "code",
					has_multiple_tests: false,
					answers: [{ input: "private input", output: "private output" }],
				} as any}
			/>
		);

		expect(screen.getByText("Решите задачу")).toBeInTheDocument();
		expect(screen.queryByText("Входные данные:")).toBeNull();
		expect(screen.queryByText("Выходные данные:")).toBeNull();
		expect(screen.queryByText("private input")).toBeNull();
		expect(screen.queryByText("private output")).toBeNull();
	});

	it("keeps paste wrappers in the editor instead of duplicating them in the description", () => {
		const { rerender } = render(
			<TaskDescription
				task={{
					description: "дополните",
					task_type: "paste",
					answers: [
						{
							hint: "f('first', 'second')",
							code_before: "public setup",
							code_after: "print(f('first', 'second'))",
							output: "done",
						},
						{},
					],
				} as any}
				hideTopSpacing
			/>
		);
		expect(screen.getByText("public setup")).toBeInTheDocument();
		expect(screen.queryByText("f('first', 'second')")).toBeNull();
		rerender(<TaskDescription task={null} />);
		expect(screen.queryByText("public setup")).toBeNull();
	});

	it("hides input and output for a paste task with only one test", () => {
		render(
			<TaskDescription
				task={{
					description: "дополните",
					task_type: "paste",
					has_multiple_tests: false,
					answers: [
						{
							code_before: "public setup",
							code_after: "print(result)",
							output: "done",
						},
					],
				} as any}
			/>
		);

		expect(screen.getByText("Дополните")).toBeInTheDocument();
		expect(screen.queryByText("Входные данные:")).toBeNull();
		expect(screen.queryByText("Выходные данные:")).toBeNull();
		expect(screen.queryByText("public setup")).toBeNull();
		expect(screen.queryByText("done")).toBeNull();
	});

	it("keeps the first public example for paste tasks with multiple tests", () => {
		render(
			<TaskDescription
				task={{
					description: "дополните",
					task_type: "paste",
					has_multiple_tests: true,
					answers: [
						{
							code_before: "public setup",
							code_after: "print(result)",
							output: "done",
						},
					],
				} as any}
			/>
		);

		expect(screen.getByText("Входные данные:")).toBeInTheDocument();
		expect(screen.getByText("Выходные данные:")).toBeInTheDocument();
		expect(screen.getByText("public setup")).toBeInTheDocument();
		expect(screen.getByText("done")).toBeInTheDocument();
	});

	it("falls back to code-before for legacy paste payloads without a hint", () => {
		render(
			<TaskDescription
				task={{
					description: "дополните",
					task_type: "paste",
					answers: [{ code_before: "legacy prefix", output: "done" }],
				} as any}
			/>
		);

		expect(screen.getByText("legacy prefix")).toBeInTheDocument();
	});

	it("uses a full-height desktop sidebar without the horizontal resize handle", () => {
		const { container } = render(
			<TaskDescription
				task={{ description: "условие", answers: [{}] } as any}
				desktopSidebar
				desktopWidth={38}
			/>
		);
		const shell = container.querySelector(".task-description-shell");
		expect(shell).toHaveClass("task-description-shell--sidebar");
		expect(shell).toHaveStyle("--task-panel-width: 38%");
		expect(
			container.querySelector(".task-description-row-resizer")
		).toBeInTheDocument();
	});
});
