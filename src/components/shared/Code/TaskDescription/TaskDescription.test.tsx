import { processTaskDescription } from "./TaskDescription.utils";

describe("processTaskDescription", () => {
	it("keeps escaped html tags visible in task text", () => {
		const description =
			"напишите код HTML для подключения JS файла. Используйте тег &lt;script>";

		expect(processTaskDescription(description)).toBe(
			"Напишите код HTML для подключения JS файла. Используйте тег &lt;script>"
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

	it("preserves existing html formatting tags", () => {
		const description = "<p>условие</p>\nследующая строка";

		expect(processTaskDescription(description)).toBe(
			"<p>Условие</p><br>следующая строка"
		);
	});
});
