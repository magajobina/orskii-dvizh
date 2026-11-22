import { useEffect, useState } from 'react';
import type { Node } from '../engine/engine';
import { imageURL } from '../content/assets';
import type { Document, Issue } from './model';
import { kindNames } from './model';

type Props = {
  document: Document; selected?: string; selectedCount: number; issues: Issue[];
  edit: (fn: (doc: Document) => void, group?: string) => void;
  rename: (id: string, next: string) => void; endGroup: () => void; focus: (id: string) => void;
  browse: (current: string, pick: (id: string) => void) => void; play: (id: string) => void;
};

export function Inspector({ document, selected, selectedCount, issues, edit, rename, endGroup, focus, browse, play }: Props) {
  const [tab, setTab] = useState('block');
  const [newId, setNewId] = useState(selected ?? '');
  useEffect(() => { setNewId(selected ?? ''); }, [selected]);
  const node = selected ? document.story.nodes[selected] : undefined;
  const change = (fn: (node: Node) => void, field?: string) => { if (selected) edit(doc => { fn(doc.story.nodes[selected]); }, field ? `${selected}:${field}` : undefined); };
  const link = (label: string, value: string, onChange: (value: string) => void) => <label className="editor-field">{label}<input list="story-targets" value={value} placeholder="ID блока" onChange={e => onChange(e.target.value)} onBlur={endGroup} /></label>;
  const assetField = (value: string, pick: (id: string) => void) => <div className="asset-field"><img src={imageURL(value)} alt="Выбранная иллюстрация" /><code>{value}</code><button onClick={() => browse(value, pick)}>Открыть галерею</button></div>;
  return <aside className="editor-inspector">
    <nav className="inspector-tabs" aria-label="Панели редактора"><button className={tab === 'block' ? 'active' : ''} onClick={() => setTab('block')}>Блок</button><button className={tab === 'story' ? 'active' : ''} onClick={() => setTab('story')}>Сюжет</button><button className={tab === 'issues' ? 'active' : ''} onClick={() => setTab('issues')}>Проверка {issues.length ? `(${issues.length})` : ''}</button></nav>
    <div className="inspector-body">
      {tab === 'block' && (!node || !selected ? <div className="editor-empty"><h2>Выберите блок</h2><p>Нажмите на карточку на схеме или найдите её слева.</p></div> : <>
        <div className="inspector-node-title"><span className={`kind-label kind-${node.type}`}>{kindNames[node.type]}</span>{selectedCount > 1 && <small>Выбрано: {selectedCount}</small>}</div>
        <label className="editor-field">ID блока<div className="inline-field"><input value={newId} onChange={e => setNewId(e.target.value)} /><button disabled={newId === selected} onClick={() => rename(selected, newId)}>Применить</button></div></label>
        <label className="editor-field">Глава<select value={node.chapterId ?? ''} onChange={e => change(n => { n.chapterId = e.target.value || undefined; })}><option value="">Нераспределённые</option>{document.story.chapters.map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select></label>
        <button className="editor-play" disabled={issues.some(i => i.severity === 'error')} onClick={() => play(selected)}>Играть с этого блока</button>
        {node.type === 'text' && <label className="editor-field">Текст реплики<textarea rows={8} value={node.text} onChange={e => change(n => { if (n.type === 'text') n.text = e.target.value; }, 'text')} onBlur={endGroup} /></label>}
        {node.type === 'scene' && <><h3>Иллюстрация</h3>{assetField(node.asset, id => change(n => { if (n.type === 'scene') n.asset = id; }))}</>}
        {'next' in node && link('Следующий блок', node.next, value => change(n => { if ('next' in n) n.next = value; }, 'next'))}
        {node.type === 'choice' && <>
          {link('Реплика-подпись (необязательно)', node.prompt ?? '', value => change(n => { if (n.type === 'choice') n.prompt = value || undefined; }, 'prompt'))}
          <h3>Варианты ответа</h3>
          {node.options.map((option, index) => <section key={`${selected}-${index}`} className="option-editor">
            <div className="option-editor-actions"><b>Ответ {index + 1}</b><span><button aria-label={`Поднять ответ ${index + 1}`} disabled={index === 0} onClick={() => change(n => { if (n.type === 'choice') [n.options[index - 1], n.options[index]] = [n.options[index], n.options[index - 1]]; })}>↑</button><button aria-label={`Опустить ответ ${index + 1}`} disabled={index === node.options.length - 1} onClick={() => change(n => { if (n.type === 'choice') [n.options[index + 1], n.options[index]] = [n.options[index], n.options[index + 1]]; })}>↓</button><button aria-label={`Удалить ответ ${index + 1}`} onClick={() => change(n => { if (n.type === 'choice') n.options.splice(index, 1); })}>×</button></span></div>
            <label className="editor-field">ID ответа<input value={option.id} onChange={e => change(n => { if (n.type === 'choice') n.options[index].id = e.target.value; }, `answer-${index}-id`)} onBlur={endGroup} /></label>
            <label className="editor-field">Текст<textarea rows={3} value={option.text} onChange={e => change(n => { if (n.type === 'choice') n.options[index].text = e.target.value; }, `answer-${index}-text`)} onBlur={endGroup} /></label>
            {link('Переход', option.next, value => change(n => { if (n.type === 'choice') n.options[index].next = value; }, `answer-${index}-next`))}
            <label className="editor-check"><input type="checkbox" checked={Boolean(option.once)} onChange={e => change(n => { if (n.type === 'choice') n.options[index].once = e.target.checked; })} />Скрыть после выбора</label>
          </section>)}
          <button className="wide-button" onClick={() => change(n => { if (n.type === 'choice') n.options.push({ id: `${selected}-answer-${crypto.randomUUID().slice(0, 8)}`, text: 'Новый ответ', next: '' }); })}>Добавить ответ</button>
        </>}
        {node.type === 'end' && <p className="editor-muted">На этом блоке прохождение заканчивается.</p>}
        {issues.filter(issue => issue.nodeId === selected).map((issue, i) => <p className={`inline-issue ${issue.severity}`} key={i}>{issue.message}</p>)}
      </>)}
      {tab === 'story' && <>
        <h2>Параметры сюжета</h2>
        {link('Начало игры', document.story.entry, value => edit(doc => { doc.story.entry = value; }, 'story-entry'))}
        <h3>Обложка</h3>{assetField(document.story.cover, id => edit(doc => { doc.story.cover = id; }))}
        <h3>Главы</h3>
        {document.story.chapters.map((chapter, index) => <section className="option-editor" key={index}>
          <div className="option-editor-actions"><b>Глава {index + 1}</b><button aria-label={`Удалить главу ${index + 1}`} onClick={() => edit(doc => { const id = doc.story.chapters[index].id; for (const node of Object.values(doc.story.nodes)) if (node.chapterId === id) delete node.chapterId; doc.story.chapters.splice(index, 1); })}>×</button></div>
          <label className="editor-field">Название<input value={chapter.title} onChange={e => edit(doc => { doc.story.chapters[index].title = e.target.value; }, `chapter-${index}-title`)} onBlur={endGroup} /></label>
          <label className="editor-field">ID главы<input value={chapter.id} onChange={e => edit(doc => { const old = doc.story.chapters[index].id; for (const node of Object.values(doc.story.nodes)) if (node.chapterId === old) node.chapterId = e.target.value; doc.story.chapters[index].id = e.target.value; }, `chapter-${index}-id`)} onBlur={endGroup} /></label>
          {link('Первый блок', chapter.entry, value => edit(doc => { doc.story.chapters[index].entry = value; }, `chapter-${index}-entry`))}
          <button className="wide-button" onClick={() => browse(chapter.image, id => edit(doc => { doc.story.chapters[index].image = id; }))}>Иллюстрация главы</button>
        </section>)}
        <button className="wide-button" onClick={() => edit(doc => { const id = `chapter-${crypto.randomUUID().slice(0, 8)}`; const entry = `${id}-start`; doc.story.nodes[entry] = { type: 'text', text: 'Новая глава', next: Object.keys(doc.story.nodes).find(key => doc.story.nodes[key].type === 'end') ?? '', chapterId: id }; doc.layout.positions[entry] = { x: 100, y: 100 }; doc.story.chapters.push({ id, title: 'Новая глава', entry, image: doc.story.cover }); })}>Добавить главу</button>
      </>}
      {tab === 'issues' && <><h2>Проверка сюжета</h2><p className="editor-muted">Ошибки блокируют запись в файл. Предупреждения помогают найти забытые блоки.</p>{!issues.length && <p className="validation-ok">Ошибок нет.</p>}{issues.map((issue, i) => <button className={`issue-button ${issue.severity}`} key={i} onClick={() => { if (issue.nodeId) { focus(issue.nodeId); setTab('block'); } }}><b>{issue.nodeId ?? 'Сюжет'}</b><span>{issue.message}</span></button>)}</>}
    </div>
    <datalist id="story-targets">{Object.entries(document.story.nodes).map(([id, n]) => <option value={id} key={id}>{n.type === 'text' ? n.text.slice(0, 60) : kindNames[n.type]}</option>)}</datalist>
  </aside>;
}
