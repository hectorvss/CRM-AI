/**
 * BranchingEditor — editor visual de branching para Surveys.
 *
 * PostHog parity: cada pregunta tiene `branching` = { type: 'end' | 'next_question' |
 * 'specific_question' | 'response_based', responseValues: { '<choice>': <indexOrEnd> } }.
 * Permite definir "si responde X → ir a la pregunta Y" o "fin de encuesta".
 */
import React from 'react';

export type Branching =
  | { type: 'next_question' }
  | { type: 'end' }
  | { type: 'specific_question'; index: number }
  | { type: 'response_based'; responseValues: Record<string, number | 'end'> };

export interface Question {
  id?:        string;
  type:       'open' | 'single_choice' | 'multiple_choice' | 'rating' | 'link';
  question:   string;
  choices?:   string[];
  branching?: Branching;
}

export function BranchingEditor({ questions, onChange }: { questions: Question[]; onChange: (next: Question[]) => void }) {
  function patch(i: number, b: Branching) {
    onChange(questions.map((q, idx) => idx === i ? { ...q, branching: b } : q));
  }
  function targets(currentIdx: number) {
    return questions
      .map((q, i) => ({ value: i, label: `${i + 1}. ${q.question.slice(0, 40)}` }))
      .filter(t => t.value !== currentIdx);
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-[#646462]">
        Define qué pregunta sigue a cada respuesta. Por defecto cada pregunta lleva a la siguiente.
      </div>
      {questions.map((q, i) => {
        const isLast = i === questions.length - 1;
        const br = q.branching ?? (isLast ? { type: 'end' } as Branching : { type: 'next_question' } as Branching);
        return (
          <div key={q.id ?? i} className="border border-[#e9eae6] rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-[#1a1a18] truncate">
                <span className="text-[#9ca3af] mr-1">P{i + 1}</span>{q.question || '(sin texto)'}
              </p>
              <span className="text-[10px] text-[#9ca3af] uppercase tracking-wider">{q.type}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-2">
              <label className={`flex items-center gap-2 p-2 rounded border cursor-pointer text-xs ${br.type === 'next_question' ? 'border-[#3b59f6] bg-[#eff2ff] text-[#3b59f6]' : 'border-[#e9eae6] text-[#646462] hover:bg-[#fafaf9]'}`}>
                <input type="radio" checked={br.type === 'next_question'} onChange={() => patch(i, { type: 'next_question' })} className="accent-[#3b59f6]" />
                Siguiente pregunta
              </label>
              <label className={`flex items-center gap-2 p-2 rounded border cursor-pointer text-xs ${br.type === 'end' ? 'border-[#3b59f6] bg-[#eff2ff] text-[#3b59f6]' : 'border-[#e9eae6] text-[#646462] hover:bg-[#fafaf9]'}`}>
                <input type="radio" checked={br.type === 'end'} onChange={() => patch(i, { type: 'end' })} className="accent-[#3b59f6]" />
                Fin de encuesta
              </label>
              <label className={`flex items-center gap-2 p-2 rounded border cursor-pointer text-xs ${br.type === 'specific_question' ? 'border-[#3b59f6] bg-[#eff2ff] text-[#3b59f6]' : 'border-[#e9eae6] text-[#646462] hover:bg-[#fafaf9]'}`}>
                <input type="radio" checked={br.type === 'specific_question'} onChange={() => patch(i, { type: 'specific_question', index: targets(i)[0]?.value ?? 0 })} className="accent-[#3b59f6]" />
                Saltar a otra pregunta
              </label>
              {(q.type === 'single_choice' || q.type === 'multiple_choice' || q.type === 'rating') && (
                <label className={`flex items-center gap-2 p-2 rounded border cursor-pointer text-xs ${br.type === 'response_based' ? 'border-[#3b59f6] bg-[#eff2ff] text-[#3b59f6]' : 'border-[#e9eae6] text-[#646462] hover:bg-[#fafaf9]'}`}>
                  <input type="radio" checked={br.type === 'response_based'} onChange={() => patch(i, { type: 'response_based', responseValues: {} })} className="accent-[#3b59f6]" />
                  Según respuesta
                </label>
              )}
            </div>

            {br.type === 'specific_question' && (
              <select
                value={br.index}
                onChange={e => patch(i, { type: 'specific_question', index: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-[#e9eae6] rounded text-sm focus:outline-none focus:border-[#3b59f6]"
              >
                {targets(i).map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            )}

            {br.type === 'response_based' && (
              <div className="space-y-1.5">
                {(q.choices ?? (q.type === 'rating' ? ['1', '2', '3', '4', '5'] : [])).map(c => (
                  <div key={c} className="flex items-center gap-2">
                    <span className="text-xs text-[#646462] flex-1 truncate">Si responde "{c}"</span>
                    <span className="text-xs text-[#9ca3af]">→</span>
                    <select
                      value={(br as any).responseValues?.[c] ?? 'next'}
                      onChange={e => {
                        const v = e.target.value;
                        const next = { ...((br as any).responseValues ?? {}) };
                        if (v === 'end') next[c] = 'end';
                        else if (v === 'next') delete next[c];
                        else next[c] = Number(v);
                        patch(i, { type: 'response_based', responseValues: next });
                      }}
                      className="px-2 py-1 border border-[#e9eae6] rounded text-xs focus:outline-none focus:border-[#3b59f6]"
                    >
                      <option value="next">Siguiente</option>
                      <option value="end">Fin</option>
                      {targets(i).map(t => <option key={t.value} value={t.value}>{t.label.slice(0, 30)}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default BranchingEditor;
