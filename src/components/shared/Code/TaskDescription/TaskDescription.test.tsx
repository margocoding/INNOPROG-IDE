import { processTaskDescription } from "./TaskDescription.utils";

describe("processTaskDescription", () => {
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
