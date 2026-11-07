import React, { useEffect, useState } from 'react';
import { Autocomplete, AutocompleteItem, Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Tab, Tabs } from '@heroui/react';
import { roomLessonCredential } from '../../../../services/api';
import { LessonModule, LessonSelection, RoomLessonState, RoomLessonTask } from '../../../../types/roomLesson';
import { Language } from '../../../../types/task';
import { currentRoomToken } from '../../../../utils/roomSession';
import { LessonCodeField } from './LessonCodeField';
import { LessonMarkdown } from '../../Code/TaskDescription/LessonMarkdown';
import './LessonPicker.css';

type Choice = { id: string; label: string; detail?: string; searchText?: string };
type CatalogTask = Pick<RoomLessonTask, 'title' | 'topic' | 'language' | 'moduleId'> & { id: number; searchText?: string };
type PersonalTask = RoomLessonTask & { id: string };
const languages = [
  ['py', 'Python'], ['cpp', 'C++'], ['java', 'Java'], ['js', 'JavaScript'],
  ['bash', 'Bash'], ['dart', 'Dart'], ['sql', 'SQL'], ['html', 'HTML'],
].map(([id, label]) => ({ id, label }));
const languageLabel = (value: string) => languages.find(item => item.id === value)?.label ?? value;

function SearchSelect({ label, choices, value, select, busy }: {
  label: string;
  choices: Choice[];
  value: string;
  select: (id: string) => void;
  busy?: boolean;
}) {
  const root = React.useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const selectedLabel = choices.find(choice => choice.id === value)?.label;
  const term = query === selectedLabel ? '' : query.trim().toLocaleLowerCase();
  const matches = term ? choices.flatMap(choice => {
    if (choice.label.toLocaleLowerCase().includes(term)) return [{ choice, rank: 0 }];
    if (choice.searchText?.toLocaleLowerCase().includes(term)) return [{ choice, rank: 1 }];
    if (choice.detail?.toLocaleLowerCase().includes(term)) return [{ choice, rank: 2 }];
    return [];
  }).sort((left, right) => left.rank - right.rank).map(match => match.choice) : choices;
  return <div ref={root} className="lesson-search-select"><Autocomplete
    label={label} placeholder="Поиск…" labelPlacement="outside" variant="bordered"
    selectedKey={value || null} onSelectionChange={key => select(key == null ? '' : String(key))}
    items={matches} onInputChange={setQuery}
    itemHeight={48}
    isLoading={busy} allowsEmptyCollection
    inputProps={{ classNames: { inputWrapper: 'lesson-field', input: 'lesson-field-input' } }}
    popoverProps={{
      classNames: { content: 'lesson-list-popover' },
      // Let clicks reach dialog controls. The combobox closes when it loses focus.
      shouldCloseOnInteractOutside: element => !root.current?.closest('.lesson-modal')?.contains(element),
    }}
    listboxProps={{ emptyContent: busy ? 'Загрузка…' : 'Ничего не найдено' }}
    scrollShadowProps={{ className: 'lesson-list-scroll' }}
  >
    {item => <AutocompleteItem key={item.id} textValue={item.label} description={item.detail}>
      {item.label}
    </AutocompleteItem>}
  </Autocomplete></div>;
}

async function roomRequest<T>(room: string, path: string, signal?: AbortSignal, data?: unknown, method = data ? 'POST' : 'GET'): Promise<T> {
  const token = currentRoomToken(room);
  if (!token) throw new Error('Переподключитесь к комнате');
  const credential = path.startsWith('platform?') ? await roomLessonCredential() : '';
  const response = await fetch(`/api/room/${encodeURIComponent(room)}/lessons/${path}`, {
    signal, cache: 'no-store',
    method,
    headers: {
      'X-Room-Token': token,
      ...(credential ? { 'X-Platform-Auth': credential } : {}),
      ...(data ? { 'Content-Type': 'application/json' } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(typeof error?.message === 'string' ? error.message : 'Не удалось загрузить задачи');
  }
  return response.json();
}

export default function LessonPicker({ room, active, select }: {
  room: string; active?: RoomLessonState;
  select: (selection: LessonSelection) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('platform');
  const [modules, setModules] = useState<LessonModule[]>([]);
  const [moduleId, setModuleId] = useState('');
  const [catalog, setCatalog] = useState<CatalogTask[]>([]);
  const [personal, setPersonal] = useState<PersonalTask[]>([]);
  const personalMutationVersion = React.useRef(0);
  const [taskId, setTaskId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PersonalTask>();
  const [deleting, setDeleting] = useState<PersonalTask>();
  const [formModuleId, setFormModuleId] = useState('');
  const [formSize, setFormSize] = useState<{ width: number; height: number }>();
  const formDrag = React.useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const resizeForm = (width: number, height: number) => setFormSize({
    width: Math.min(window.innerWidth - 32, Math.max(560, width)),
    height: Math.min(window.innerHeight - 40, Math.max(360, height)),
  });
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState<Language | ''>('');
  const [previewDescription, setPreviewDescription] = useState(false);
  const [expandedDescription, setExpandedDescription] = useState(false);
  const [importingDescription, setImportingDescription] = useState(false);
  const descriptionFile = React.useRef<HTMLInputElement>(null);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [initialCode, setInitialCode] = useState('');
  const [after, setAfter] = useState('');

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const report = (reason: Error) => { if (!controller.signal.aborted) setError(reason.message); };
    roomRequest<LessonModule[]>(room, 'modules', controller.signal).then(setModules).catch(report);
    const libraryVersion = personalMutationVersion.current;
    roomRequest<PersonalTask[]>(room, 'personal', controller.signal).then(items => {
      if (!controller.signal.aborted && libraryVersion === personalMutationVersion.current) setPersonal(items);
    }).catch(report);
    return () => controller.abort();
  }, [open, room]);

  useEffect(() => {
    if (!open || tab !== 'platform' || !moduleId) return;
    const controller = new AbortController();
    setLoading(true);
    const load = async () => {
      const tasks = new Map<number, CatalogTask>();
      for (let page = 1; page <= 9999 && !controller.signal.aborted; page++) {
        const params = new URLSearchParams({ module: moduleId, page: String(page) });
        const result = await roomRequest<{ items: CatalogTask[]; hasMore: boolean }>(
          room, 'platform?' + params, controller.signal,
        );
        if (controller.signal.aborted) return;
        for (const task of result.items) tasks.set(task.id, task);
        setCatalog([...tasks.values()]);
        if (!result.hasMore) return;
      }
    };
    load()
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, tab, moduleId, room]);

  const resetChoice = () => {
    setTaskId('');
    setCatalog([]);
    setError('');
  };
  const chooseModule = (id: string) => {
    if (id === moduleId) return;
    setModuleId(id);
    resetChoice();
  };
  const apply = async (selection: LessonSelection) => {
    setSaving(true);
    setError('');
    try { await select(selection); setOpen(false); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось открыть задачу'); }
    finally { setSaving(false); }
  };
  const chooseFormModule = (id: string) => {
    if (id === formModuleId) return;
    setFormModuleId(id);
    setLanguage(modules.find(item => String(item.id) === id)?.language ?? '');
  };
  const fillForm = (task?: PersonalTask) => {
    setEditing(task);
    setFormModuleId(task ? String(task.moduleId) : '');
    setTitle(task?.title ?? '');
    setDescription(task?.description ?? '');
    setLanguage(task?.language ?? '');
    setInput(task?.input ?? '');
    setOutput(task?.output ?? '');
    setInitialCode(task?.initialCode ?? '');
    setAfter(task?.after ?? '');
    setPreviewDescription(false);
    setExpandedDescription(false);
  };
  const closeForm = () => {
    if (editing) fillForm();
    setCreating(false);
    setExpandedDescription(false);
  };
  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const path = editing ? 'personal/' + encodeURIComponent(editing.id) : 'personal';
      const task = await roomRequest<PersonalTask>(room, path, undefined, {
        title, description, descriptionFormat: 'markdown', moduleId: Number(formModuleId), language, input, output, initialCode, after,
      }, editing ? 'PUT' : 'POST');
      personalMutationVersion.current++;
      setPersonal(items => editing ? items.map(item => item.id === task.id ? task : item) : [task, ...items]);
      setCreating(false);
      fillForm();
      setModuleId(String(task.moduleId));
      setTaskId(task.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить задачу');
    } finally { setSaving(false); }
  };
  const remove = async () => {
    if (!deleting) return;
    setSaving(true);
    setError('');
    try {
      await roomRequest(room, 'personal/' + encodeURIComponent(deleting.id), undefined, undefined, 'DELETE');
      personalMutationVersion.current++;
      setPersonal(items => items.filter(item => item.id !== deleting.id));
      setTaskId('');
      if (!personal.some(item => item.id !== deleting.id && String(item.moduleId) === moduleId)) setModuleId('');
      setDeleting(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось удалить задачу');
    } finally { setSaving(false); }
  };
  const importDescription = async (file?: File) => {
    if (!file) return;
    setError('');
    if (!/\.(md|markdown)$/i.test(file.name) || file.size > 48_000) {
      setError('Выберите файл .md или .markdown размером до 48 КБ');
      return;
    }
    setImportingDescription(true);
    try {
      const content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      setDescription(content);
      setPreviewDescription(false);
    } catch {
      setError('Не удалось прочитать файл. Сохраните его в кодировке UTF-8');
    } finally {
      setImportingDescription(false);
    }
  };
  const personalModuleIds = new Set(personal.map(task => String(task.moduleId)));
  const moduleChoices = modules.map(item => ({ id: String(item.id), label: item.name }));
  const availableModuleIds = new Set(moduleChoices.map(item => item.id));
  const personalModuleChoices = [
    ...moduleChoices.filter(item => personalModuleIds.has(item.id)),
    ...[...personalModuleIds].filter(id => !availableModuleIds.has(id)).map(id => ({ id, label: `Модуль ${id}` })),
  ];
  const pickerModules = tab === 'personal' ? personalModuleChoices : moduleChoices;
  const pickerModuleId = pickerModules.some(item => item.id === moduleId) ? moduleId : '';
  const formModules = editing && !availableModuleIds.has(String(editing.moduleId))
    ? [...moduleChoices, { id: String(editing.moduleId), label: `Модуль ${editing.moduleId}` }]
    : moduleChoices;
  const selectedPersonal = tab === 'personal' && pickerModuleId
    ? personal.find(task => task.id === taskId && String(task.moduleId) === pickerModuleId) : undefined;
  const tasks = tab === 'platform' ? catalog : personal.filter(task => String(task.moduleId) === moduleId);
  const taskChoices = tasks.map(task => ({
    id: String(task.id), label: task.title,
    detail: [task.topic, languageLabel(task.language)].filter(Boolean).join(', '),
    searchText: 'description' in task ? task.description : task.searchText,
  }));

  return <>
    <button type="button" className="lesson-trigger" onClick={() => { setError(''); setOpen(true); }} aria-haspopup="dialog" aria-label="Задачи" title="Задачи">
      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" aria-hidden="true">
        <rect x="4" y="2.5" width="12" height="15" rx="2"/><path d="M7 7h6M7 10h6M7 13h4"/>
      </svg>
      <span>Задачи</span>
    </button>
    {open && <Modal isOpen={open} onOpenChange={next => {
      if (!next && saving) return;
      setOpen(next);
      if (!next) {
        closeForm();
        setDeleting(undefined);
      }
    }} hideCloseButton={saving} isDismissable={!saving && !importingDescription} isKeyboardDismissDisabled={saving || importingDescription || expandedDescription} placement="center" scrollBehavior="inside"
      style={creating && formSize ? {
        '--lesson-form-width': `${formSize.width}px`,
        '--lesson-form-height': `${formSize.height}px`,
      } as React.CSSProperties : undefined}
      classNames={{ base: creating ? `lesson-modal lesson-modal--create ${expandedDescription ? 'lesson-modal--description' : ''}` : 'lesson-modal', header: 'lesson-modal-header', body: 'lesson-modal-body', footer: 'lesson-modal-footer' }}>
      <ModalContent onKeyDown={event => {
        if (expandedDescription && event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          setExpandedDescription(false);
        }
      }}>
        <ModalHeader>
          <span>{deleting ? "Удаление задачи" : expandedDescription ? "Условие задачи" : creating ? editing ? "Редактирование задачи" : "Новая задача" : "Задача для занятия"}</span>
          {!creating && !deleting && active?.task && <div className="lesson-current">
            <span>Сейчас в комнате</span><strong>{active.task.title}</strong>
          </div>}
        </ModalHeader>
        <ModalBody>
          {!creating && !deleting && <div className="lesson-picker-actions">
          <Tabs aria-label="Источник задачи" selectedKey={tab} onSelectionChange={key => {
            setTab(String(key)); setCreating(false); resetChoice();
          }} color="secondary" variant="solid" classNames={{ tabList: 'lesson-tabs' }}>
            <Tab key="platform" title="С платформы" />
            <Tab key="personal" title="Мои задачи" />
          </Tabs>
            {tab === 'personal' && <Button size="sm" radius="sm" className="lesson-add" aria-label="Добавить задачу" title="Добавить задачу" variant="solid" color="secondary" onPress={() => { if (!formModuleId && availableModuleIds.has(pickerModuleId)) chooseFormModule(pickerModuleId); setCreating(true); setError(''); }} startContent={
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>
            }><span>Добавить задачу</span></Button>}
          </div>}
          {deleting ? <p>Удалить «{deleting.title}» из личных задач?</p> : creating ? <div className="lesson-create-grid">
            <div className="lesson-create-column">
              <Input label="Название задачи" labelPlacement="outside" placeholder="Введите название" variant="bordered" maxLength={160} value={title} onValueChange={setTitle} />
              <div className="lesson-fields-row">
                <SearchSelect label="Модуль" choices={formModules} value={formModuleId} select={chooseFormModule} />
                <SearchSelect label="Язык" choices={languages} value={language} select={id => setLanguage(id as Language | '')} />
              </div>
              <div className="lesson-description-editor">
                <div className="lesson-description-tools">
                  <span>Условие</span>
                  <div>
                    <Button size="sm" variant="light" className="lesson-description-action"
                      aria-label={previewDescription ? 'Редактировать' : 'Предпросмотр'}
                      aria-pressed={previewDescription} onPress={() => setPreviewDescription(value => !value)}>
                      <svg className="md:hidden" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        {previewDescription
                          ? <path d="M4 13.5 13.5 4a1.4 1.4 0 0 1 2 0l.5.5a1.4 1.4 0 0 1 0 2L6.5 16 3 17zM12 5.5l2.5 2.5" />
                          : <><path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z" /><circle cx="10" cy="10" r="2" /></>}
                      </svg>
                      <span className="hidden md:inline">{previewDescription ? 'Редактировать' : 'Предпросмотр'}</span>
                    </Button>
                    <Button size="sm" variant="bordered" className="lesson-description-action" aria-label="Импорт .md" isLoading={importingDescription} onPress={() => descriptionFile.current?.click()} startContent={
                      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M10 13V3m-4 4 4-4 4 4M4 12v4h12v-4" />
                      </svg>
                    }>
                      <span className="hidden md:inline">Импорт .md</span>
                    </Button>
                    <Button size="sm" isIconOnly variant="bordered" className="lesson-description-expand"
                      aria-label={expandedDescription ? 'Свернуть условие' : 'Развернуть условие'}
                      title={expandedDescription ? 'Свернуть условие' : 'Развернуть условие'}
                      aria-expanded={expandedDescription} onPress={() => setExpandedDescription(value => !value)}>
                      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d={expandedDescription ? 'M3 7h4V3m10 4h-4V3M3 13h4v4m10-4h-4v4' : 'M7 3H3v4m10-4h4v4M7 17H3v-4m10 4h4v-4'} />
                      </svg>
                    </Button>
                  </div>
                </div>
                <input ref={descriptionFile} type="file" accept=".md,.markdown" hidden onChange={event => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = '';
                  void importDescription(file);
                }} />
                {previewDescription
                  ? <div className="lesson-description-preview prose prose-invert max-w-none" aria-label="Предпросмотр условия">
                    {description.trim() ? <LessonMarkdown source={description} /> : 'Добавьте текст условия'}
                  </div>
                  : <textarea className="lesson-description-input" aria-label="Условие задачи" placeholder="Опишите задачу" value={description} onChange={event => setDescription(event.target.value)} readOnly={importingDescription} />}
              </div>
            </div>
            <div className="lesson-create-column">
              <div className="lesson-form-group" role="group" aria-label="Пример">
                <div className="lesson-form-group-title">Пример <span>необязательно</span></div>
                <div className="lesson-fields-row">
                  <label className="lesson-example-field">
                    <span>Входные данные</span>
                    <textarea className="lesson-description-input lesson-example-input" placeholder="Что получает программа" value={input} onChange={event => setInput(event.target.value)} />
                  </label>
                  <label className="lesson-example-field">
                    <span>Выходные данные</span>
                    <textarea className="lesson-description-input lesson-example-input" placeholder="Что выводит программа" value={output} onChange={event => setOutput(event.target.value)} />
                  </label>
                </div>
              </div>
              <div className="lesson-form-group" role="group" aria-label="Код в редакторе">
                <div className="lesson-form-group-title">Код в редакторе <span>необязательно</span></div>
                <div className="lesson-code-fields">
                  <LessonCodeField label="Стартовый код" language={language} value={initialCode} onChange={setInitialCode} />
                  <LessonCodeField label="Код после решения" language={language} value={after} onChange={setAfter} />
                </div>
              </div>
            </div>
          </div> : <>
            {tab === 'personal' && !personal.length ? <p>Личных задач пока нет</p> :
              <SearchSelect label="Модуль" choices={pickerModules} value={pickerModuleId} select={chooseModule} />}
            {pickerModuleId && <div className="lesson-task-choice">
              <SearchSelect key={tab + pickerModuleId} label="Задача" choices={taskChoices} value={taskId} select={setTaskId} busy={tab === 'platform' && loading} />
              {tab === 'personal' && <>
                <Button isIconOnly variant="bordered" isDisabled={!selectedPersonal} aria-label="Редактировать задачу" title="Редактировать задачу" onPress={() => {
                  if (!selectedPersonal) return;
                  fillForm(selectedPersonal); setError(''); setCreating(true);
                }}>
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true"><path d="m4 13-1 4 4-1L17 6l-3-3L4 13zm8-8 3 3"/></svg>
                </Button>
                <Button isIconOnly color="danger" variant="flat" isDisabled={!selectedPersonal} aria-label="Удалить задачу" title="Удалить задачу" onPress={() => { setError(''); setDeleting(selectedPersonal); }}>
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true"><path d="M3 5h14M7 5V3h6v2M5 5l1 12h8l1-12M8 8v6m4-6v6"/></svg>
                </Button>
              </>}
            </div>}
          </>}
          {error && <p role="alert" className="lesson-error">{error}</p>}
        </ModalBody>
        <ModalFooter>
          {deleting ? <>
            <Button variant="light" isDisabled={saving} onPress={() => { setDeleting(undefined); setError(''); }}>Отмена</Button>
            <Button color="danger" isLoading={saving} onPress={remove}>Удалить</Button>
          </> : creating ? <>
            <Button variant="light" isDisabled={saving || importingDescription} onPress={closeForm}>Назад</Button>
            <Button color="secondary" isLoading={saving} isDisabled={importingDescription || !title.trim() || !description.trim() || !formModuleId || !language} onPress={save}>Сохранить</Button>
            <button type="button" className="lesson-resize-handle"
              aria-label="Изменить размер окна стрелками" title="Потяните, чтобы изменить размер"
              onPointerDown={event => {
                if (event.button !== 0) return;
                const rect = event.currentTarget.closest('.lesson-modal')?.getBoundingClientRect();
                if (!rect) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                formDrag.current = { x: event.clientX, y: event.clientY, width: rect.width, height: rect.height };
              }}
              onPointerMove={event => {
                const drag = formDrag.current;
                if (drag) resizeForm(drag.width + 2 * (event.clientX - drag.x), drag.height + 2 * (event.clientY - drag.y));
              }}
              onLostPointerCapture={() => { formDrag.current = null; }}
              onKeyDown={event => {
                const horizontal = Number(event.key === 'ArrowRight') - Number(event.key === 'ArrowLeft');
                const vertical = Number(event.key === 'ArrowDown') - Number(event.key === 'ArrowUp');
                if (!horizontal && !vertical) return;
                const rect = event.currentTarget.closest('.lesson-modal')?.getBoundingClientRect();
                if (!rect) return;
                event.preventDefault();
                resizeForm(rect.width + horizontal * 24, rect.height + vertical * 24);
              }}
            ><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" aria-hidden="true"><path d="m2 12 10-10M7 12l5-5m-1 5 1-1" /></svg></button>
          </> : <>
            {active?.task && <Button variant="bordered" className="lesson-free-editor" isDisabled={saving} onPress={() => void apply({ source: 'free' })}>Свободный редактор</Button>}
            <Button color="secondary" isLoading={saving} isDisabled={!pickerModuleId || !tasks.some(task => String(task.id) === taskId)} onPress={() => void apply(tab === 'platform' ? { source: 'platform', id: Number(taskId) } : { source: 'personal', id: taskId })}>Открыть в комнате</Button>
          </>}
        </ModalFooter>
      </ModalContent>
    </Modal>}
  </>;
}
