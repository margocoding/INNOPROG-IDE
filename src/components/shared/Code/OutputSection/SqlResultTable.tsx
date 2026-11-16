import { useState } from "react";
import type { SqlResult } from "../../../../types/task";

const PAGE_SIZE = 100;

export default function SqlResultTable({ result, number }: { result: SqlResult; number: number }) {
	const [position, setPosition] = useState({ result, page: 0 });
	const page = position.result === result ? position.page : 0;
	const { columns, rows } = result;
	const start = page * PAGE_SIZE;

	return (
		<section className="space-y-2">
			<div className="ide-sql-scroll" tabIndex={0} role="region" aria-label={`Результат запроса ${number}`}>
				<table className="ide-sql-table" aria-label={`Результат запроса ${number}`}>
					<thead>
						<tr>{columns.map((name, index) => <th key={index} scope="col">{name}</th>)}</tr>
					</thead>
					<tbody>
						{rows.slice(start, start + PAGE_SIZE).map((row, rowIndex) => (
							<tr key={start + rowIndex}>
								{row.map((cell, index) => (
									<td key={index}>{cell === null ? <span className="ide-sql-null">NULL</span> : cell}</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{rows.length === 0 && <p className="text-sm text-ide-text-secondary">Нет строк</p>}
			{rows.length > PAGE_SIZE && (
				<div className="ide-sql-pagination">
					<button type="button" disabled={page === 0} onClick={() => setPosition({ result, page: page - 1 })}>
						Назад
					</button>
					<span aria-live="polite">{start + 1}–{Math.min(rows.length, start + PAGE_SIZE)} из {rows.length}</span>
					<button type="button" disabled={start + PAGE_SIZE >= rows.length} onClick={() => setPosition({ result, page: page + 1 })}>
						Дальше
					</button>
				</div>
			)}
		</section>
	);
}
