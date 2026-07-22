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
					answers: [{ input: "1", output: "2" }],
				} as any}
			/>
		);
		expect(screen.getByText("Решите задачу")).toBeInTheDocument();
		expect(screen.getByText("Входные данные:")).toBeInTheDocument();
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

	it("uses code-before for multi-answer paste tasks and hides absent tasks", () => {
		const { rerender } = render(
			<TaskDescription
				task={{
					description: "дополните",
					task_type: "paste",
					answers: [
						{ code_before: "prefix", output: "done" },
						{},
					],
				} as any}
				hideTopSpacing
			/>
		);
		expect(screen.getByText("prefix")).toBeInTheDocument();
		rerender(<TaskDescription task={null} />);
		expect(screen.queryByText("prefix")).toBeNull();
	});
});
