const fs = require('fs');
let c = fs.readFileSync('src/components/Tracker.tsx', 'utf8');

c = c.replace(/import \{ Users, FileText, CreditCard, Download, Search \} from "lucide-react";/, 
'import { Users, FileText, CreditCard, Download, Search, Folder, ChevronDown, ChevronRight, ArrowUpDown } from "lucide-react";');

// Add states
c = c.replace(/const \[previewOpen, setPreviewOpen\] = useState\(false\);/, 
`const [previewOpen, setPreviewOpen] = useState(false);
  const [sortOrder, setSortOrder] = useState<'desc'|'asc'>('desc');
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  
  const toggleFolder = (key: string) => setExpandedFolders(p => ({ ...p, [key]: !p[key] }));`);

// Add grouping logic before exportRows
c = c.replace(/const exportRows = /, 
`const grouped = useMemo(() => {
    const groups: Record<string, any[]> = {};
    filtered.forEach(r => {
      const d = new Date(r.created_at || Date.now());
      const year = d.getFullYear();
      const month = d.toLocaleString('default', { month: 'long' });
      const key = \`\${year} - \${month}\`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    let sortedKeys = Object.keys(groups).sort((a, b) => {
      const [yearA, monthA] = a.split(' - ');
      const [yearB, monthB] = b.split(' - ');
      const dateA = new Date(\`\${monthA} 1, \${yearA}\`);
      const dateB = new Date(\`\${monthB} 1, \${yearB}\`);
      return sortOrder === 'desc' ? dateB.getTime() - dateA.getTime() : dateA.getTime() - dateB.getTime();
    });
    return sortedKeys.map(key => ({
      key,
      items: groups[key].sort((a, b) => {
        const da = new Date(a.created_at || 0).getTime();
        const db = new Date(b.created_at || 0).getTime();
        return sortOrder === 'desc' ? db - da : da - db;
      })
    }));
  }, [filtered, sortOrder]);

  const exportRows = `);

// Replace the sorting button in the UI
c = c.replace(/<div className="flex gap-2">/,
`<div className="flex gap-2">
          <Button variant="outline" onClick={() => setSortOrder(s => s === 'desc' ? 'asc' : 'desc')} title="Toggle Sort Order"><ArrowUpDown className="h-4 w-4 mr-1" /> {sortOrder === 'desc' ? 'Newest' : 'Oldest'}</Button>`);

// Replace the list rendering
const oldListRegex = /<div className="space-y-3 pr-4">\s*\{filtered\.map\(r => \([\s\S]*?\}\)\)\}\s*<\/div>/;
const newList = `<div className="space-y-6 pr-4">
            {grouped.map(group => (
              <div key={group.key} className="space-y-2">
                <div 
                  className="flex items-center gap-2 cursor-pointer p-2 hover:bg-muted/50 rounded-lg select-none"
                  onClick={() => toggleFolder(group.key)}
                >
                  {expandedFolders[group.key] !== false ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  <Folder className="h-5 w-5 text-blue-500 fill-blue-500/20" />
                  <h3 className="font-semibold text-lg">{group.key}</h3>
                  <Badge variant="secondary" className="ml-2">{group.items.length}</Badge>
                </div>
                
                {expandedFolders[group.key] !== false && (
                  <div className="space-y-3 pl-8">
                    {group.items.map(r => (
                      <div key={r.id || r.number || r.reference} className="p-3 border rounded-xl flex items-center justify-between hover:bg-muted/40">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold">{r.payee || r.reference || r.number}</h4>
                            <Badge className="text-[10px]">{r.status || 'unknown'}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{r.notes}</p>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">{fmtCurrency(r.amount || 0)}</div>
                          <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
                          <div className="mt-2 flex gap-2 justify-end">
                            {tab === 'receipts' && r.receipt_url && (
                              <Button size="sm" onClick={async () => {
                                try {
                                  const { data } = supabase.storage.from('receipts').getPublicUrl(r.receipt_url);
                                  setPreviewUrl(data.publicUrl);
                                  setPreviewOpen(true);
                                } catch (e: any) { toast({ title: 'Preview failed', description: e?.message || String(e), variant: 'destructive' }); }
                              }}>View</Button>
                            )}
                            {tab === 'invoices' && (
                              <Button size="sm" onClick={() => { setInvoiceForm({ number: r.number || '', payee: r.payee || '', amount: String(r.amount || 0) }); setAddInvoiceOpen(true); }}>Edit</Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>`;
c = c.replace(oldListRegex, newList);

fs.writeFileSync('src/components/Tracker.tsx', c);
console.log('Tracker updated');
