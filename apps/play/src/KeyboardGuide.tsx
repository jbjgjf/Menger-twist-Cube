const groups = [
  {
    title: '基本',
    rows: [
      ['Tab', 'Slice / Extension モードを切り替え'],
      ['Q / E', '現在モードの対象を前後に移動'],
      ['A / D', '選択中の対象を -90 / +90 度回転'],
      ['S', '選択中の対象を 180 度回転'],
      ['J / L / K', 'A / D / S と同じ回転操作'],
    ],
  },
  {
    title: 'Slice モード',
    rows: [
      ['X / Y / Z', '回転軸を選択'],
      ['[ / ]', '同じ軸・厚みの layer/group を前後に移動'],
      ['- / =', 'slice の厚みを変更'],
      ['1-9', '先頭 9 個の frame を直接選択'],
      ['Shift+1-9 / Alt+1-9', '先頭 9 個の frame を +90 / -90 度で即回転'],
    ],
  },
  {
    title: 'Extension モード',
    rows: [
      ['- / =', 'D1 -> D1.5 -> D2 のように深度を移動'],
      ['Q / E', '現在の D または D.5 内で対象を前後に移動'],
      ['A / D / S', '選択中の block/slab を回転'],
      ['Click', '表示中の深度にある extension 対象を選択'],
    ],
  },
  {
    title: '表示と履歴',
    rows: [
      ['T', '透明表示を切り替え'],
      ['F', 'frame guide を切り替え'],
      ['U / R', 'Undo / Redo'],
      ['Backspace', 'リセット'],
      ['G', 'Scramble'],
    ],
  },
  {
    title: 'カメラ',
    rows: [
      ['C', 'カメラをリセット'],
      ['V', 'Front'],
      ['B', 'Up'],
      ['N', 'Right'],
    ],
  },
];

export default function KeyboardGuide() {
  return (
    <main className="min-h-full bg-slate-950 px-4 py-5 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Menger Twist Cube</p>
            <h1 className="mt-1 text-2xl font-bold">Keyboard Guide</h1>
          </div>
          <a
            href="/"
            className="rounded-md border border-slate-600 bg-slate-800/80 px-3 py-2 text-xs font-medium text-slate-100 transition hover:bg-slate-700"
          >
            Back to play
          </a>
        </div>

        <section className="mb-5 rounded-lg border border-amber-500/40 bg-amber-950/30 p-4 text-sm leading-6 text-amber-50">
          <p className="font-semibold">D.5 slab 操作</p>
          <p className="mt-1 text-amber-100/90">
            Level 2 では D1 block の内部に 3x3x1 の D1.5 slab が追加されています。
            Level n では、Dk block がさらに 3 分割できる時だけ Dk.5 slab が生成されます。
          </p>
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          {groups.map((group) => (
            <section key={group.title} className="rounded-lg border border-slate-700 bg-slate-900/70 p-4">
              <h2 className="text-sm font-semibold text-white">{group.title}</h2>
              <dl className="mt-3 space-y-2">
                {group.rows.map(([key, action]) => (
                  <div key={key} className="grid grid-cols-[8.5rem_1fr] gap-3 text-sm">
                    <dt className="rounded border border-slate-700 bg-slate-950/70 px-2 py-1 text-center font-mono text-cyan-200">
                      {key}
                    </dt>
                    <dd className="flex items-center text-slate-300">{action}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
