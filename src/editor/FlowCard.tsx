import { memo, useEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals } from '@xyflow/react';
import type { Node as FlowNode, NodeProps } from '@xyflow/react';
import type { Node } from '../engine/engine';
import { imageURL } from '../content/assets';
import { kindNames } from './model';

export type FlowCardData = { node: Node; entry: boolean; invalid: boolean; external?: string; chapterTitle?: string };
export type StoryFlowNode = FlowNode<FlowCardData, 'story'>;

export const FlowCard = memo(function FlowCard({ id, data, selected }: NodeProps<StoryFlowNode>) {
  const node = data.node;
  const update = useUpdateNodeInternals();
  const signature = node.type === 'choice' ? node.options.map(option => option.id).join('|') : node.type;
  useEffect(() => { update(id); }, [id, signature, update]);
  if (data.external) return <div className="flow-card external-card"><Handle type="target" position={Position.Left} id="in" /><div className="flow-card-heading">Переход в главу</div><p className="external-title">{data.chapterTitle ?? 'Другая глава'}</p><code>{data.external}</code></div>;
  return <div className={`flow-card kind-${node.type} ${selected ? 'is-selected' : ''} ${data.invalid ? 'has-error' : ''}`}>
    <Handle type="target" position={Position.Left} id="in" />
    <div className="flow-card-heading"><span>{kindNames[node.type]}</span>{data.entry && <b>СТАРТ</b>}</div>
    <code>{id}</code>
    {node.type === 'text' && <p>{node.text || 'Пустая реплика'}</p>}
    {node.type === 'scene' && <><img src={imageURL(node.asset)} alt="" loading="lazy" /><small>{node.asset || 'Выберите иллюстрацию'}</small></>}
    {node.type === 'jump' && <p className="flow-destination">{node.next || 'Не подключён'}</p>}
    {node.type === 'end' && <p>Завершение истории</p>}
    {node.type === 'choice' && <div className="flow-answers">{node.options.map(option => <div key={option.id}><span>{option.once ? '◈ ' : ''}{option.text || 'Новый ответ'}</span><Handle type="source" position={Position.Right} id={`option:${option.id}`} /></div>)}</div>}
    {'next' in node && <Handle type="source" position={Position.Right} id="next" />}
  </div>;
});
