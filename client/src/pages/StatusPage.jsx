import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApp, STATUS_LABEL } from '../lib/context.js';
import ItemList from '../components/ItemList.jsx';

// 按状态看全部条目，比如「全部待复习」
export default function StatusPage() {
  const { status } = useParams();
  const { toast } = useApp();
  const [items, setItems] = useState(null);

  useEffect(() => {
    setItems(null);
    api(`/items?status=${status}`).then((d) => setItems(d.items)).catch((e) => toast(e.message, 'error'));
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  // 改了状态的条目留在列表里（方便撤回），刷新后才消失
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link to="/study" className="text-sm text-muted hover:text-ink">← 学习</Link>
      <h1 className="text-2xl font-semibold">全部 · {STATUS_LABEL[status] || '条目'}</h1>
      {items ? <ItemList items={items} setItems={setItems} showStatusFilter={false} /> : <p className="text-muted text-sm">加载中…</p>}
    </div>
  );
}
