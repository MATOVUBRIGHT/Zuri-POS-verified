import { useState, useEffect } from 'react';
import { useShift } from '@/providers/ShiftProvider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  Database,
  Upload,
  Layout,
  Settings as SettingsIcon,
  Plus,
  Trash2,
} from 'lucide-react';

export interface PrintField {
  id: string;
  name: string;
  label: string;
  enabled: boolean;
  fontSize?: number;
  order: number;
}

export interface PageLayout {
  id: string;
  name: string;
  width: number;
  height: number;
  unit: 'mm' | 'inch';
  columns: number;
  rows: number;
  orientation: 'portrait' | 'landscape';
  fields: PrintField[];
  enabled: boolean;
  order: number;
}

export interface DataSource {
  id: string;
  name: string;
  type: 'excel' | 'csv' | 'database' | 'local';
  connection?: {
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    table?: string;
  };
  filePath?: string;
  fieldMappings: Record<string, string>;
  lastUsed?: string;
}

interface BarcodePrintSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEFAULT_FIELDS: PrintField[] = [
  { id: 'productName', name: 'productName', label: 'Product Name', enabled: true, fontSize: 10, order: 1 },
  { id: 'barcode', name: 'barcode', label: 'Barcode', enabled: true, fontSize: 12, order: 2 },
  { id: 'price', name: 'price', label: 'Price', enabled: true, fontSize: 11, order: 3 },
  { id: 'sku', name: 'sku', label: 'SKU', enabled: false, fontSize: 8, order: 4 },
  { id: 'category', name: 'category', label: 'Category', enabled: false, fontSize: 8, order: 5 },
  { id: 'quantity', name: 'quantity', label: 'Quantity', enabled: false, fontSize: 8, order: 6 },
];

const DEFAULT_LAYOUTS: PageLayout[] = [
  {
    id: 'default-50x30',
    name: '50×30 mm Standard',
    width: 50,
    height: 30,
    unit: 'mm',
    columns: 4,
    rows: 10,
    orientation: 'portrait',
    fields: DEFAULT_FIELDS,
    enabled: true,
    order: 1,
  },
  {
    id: 'default-100x50',
    name: '100×50 mm Wide',
    width: 100,
    height: 50,
    unit: 'mm',
    columns: 2,
    rows: 5,
    orientation: 'landscape',
    fields: DEFAULT_FIELDS,
    enabled: false,
    order: 2,
  },
];

export default function BarcodePrintSettingsDialog({
  open,
  onOpenChange,
}: BarcodePrintSettingsDialogProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('data-source');
  
  // Data Source State
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [selectedDataSource, setSelectedDataSource] = useState<DataSource | null>(null);
  const [newDataSourceName, setNewDataSourceName] = useState('');
  const [dataSourceType, setDataSourceType] = useState<'excel' | 'csv' | 'database' | 'local'>('excel');
  
  // Layout State
  const [layouts, setLayouts] = useState<PageLayout[]>(DEFAULT_LAYOUTS);
  const [selectedLayout, setSelectedLayout] = useState<PageLayout | null>(layouts[0]);
  const [newLayoutName, setNewLayoutName] = useState('');
  
  // Database Connection State
  const [dbConnection, setDbConnection] = useState({
    host: 'localhost',
    port: 5432,
    database: '',
    username: '',
    password: '',
    table: '',
  });

  const { store } = useShift();
  const storeId = store?.id || localStorage.getItem('brec_current_store') || null;

  // Load saved settings on mount
  useEffect(() => {
    try {
      const dataKey = storeId ? `barcodePrintDataSources_${storeId}` : 'barcodePrintDataSources';
      const layoutKey = storeId ? `barcodePrintLayouts_${storeId}` : 'barcodePrintLayouts';
      const savedDataSources = localStorage.getItem(dataKey);
      const savedLayouts = localStorage.getItem(layoutKey);

      if (savedDataSources) {
        try { setDataSources(JSON.parse(savedDataSources)); } catch (e) { console.error('Failed to load data sources:', e); }
      }

      if (savedLayouts) {
        try { const parsedLayouts = JSON.parse(savedLayouts); setLayouts(parsedLayouts); setSelectedLayout(parsedLayouts[0]); } catch (e) { console.error('Failed to load layouts:', e); }
      }
    } catch (e) {
      console.error('Failed to access localStorage for barcode print settings', e);
    }
  }, [open, storeId]);

  // Handle File Upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (newDataSourceName.trim() === '') {
      toast({
        title: 'Name Required',
        description: 'Please enter a name for this data source',
        variant: 'destructive',
      });
      return;
    }

    const newDataSource: DataSource = {
      id: Date.now().toString(),
      name: newDataSourceName,
      type: dataSourceType,
      filePath: file.name,
      fieldMappings: {},
      lastUsed: new Date().toISOString(),
    };

    setDataSources([...dataSources, newDataSource]);
    setNewDataSourceName('');
    
    toast({
      title: 'Data Source Added',
      description: `"${newDataSourceName}" added successfully`,
    });
  };

  // Handle Database Connection Save
  const handleSaveDatabaseConnection = () => {
    if (!dbConnection.host || !dbConnection.database || !dbConnection.table) {
      toast({
        title: 'Missing Fields',
        description: 'Please fill in all required database fields',
        variant: 'destructive',
      });
      return;
    }

    const newDataSource: DataSource = {
      id: Date.now().toString(),
      name: `${dbConnection.database} (${dbConnection.host})`,
      type: 'database',
      connection: dbConnection,
      fieldMappings: {},
      lastUsed: new Date().toISOString(),
    };

    setDataSources([...dataSources, newDataSource]);
    toast({
      title: 'Database Connected',
      description: `Connected to ${dbConnection.database} on ${dbConnection.host}`,
    });
  };

  // Handle Add Layout
  const handleAddLayout = () => {
    if (!newLayoutName.trim()) {
      toast({
        title: 'Name Required',
        description: 'Please enter a name for the layout',
        variant: 'destructive',
      });
      return;
    }

    const newLayout: PageLayout = {
      id: Date.now().toString(),
      name: newLayoutName,
      width: 50,
      height: 30,
      unit: 'mm',
      columns: 4,
      rows: 10,
      orientation: 'portrait',
      fields: DEFAULT_FIELDS,
      enabled: true,
      order: layouts.length + 1,
    };

    setLayouts([...layouts, newLayout]);
    setNewLayoutName('');
    
    toast({
      title: 'Layout Created',
      description: `"${newLayoutName}" created successfully`,
    });
  };

  // Handle Toggle Field
  const handleToggleField = (layoutId: string, fieldId: string) => {
    setLayouts(
      layouts.map(layout =>
        layout.id === layoutId
          ? {
              ...layout,
              fields: layout.fields.map(field =>
                field.id === fieldId ? { ...field, enabled: !field.enabled } : field
              ),
            }
          : layout
      )
    );
  };

  // Handle Update Field Font Size
  const handleUpdateFieldFontSize = (
    layoutId: string,
    fieldId: string,
    fontSize: number
  ) => {
    setLayouts(
      layouts.map(layout =>
        layout.id === layoutId
          ? {
              ...layout,
              fields: layout.fields.map(field =>
                field.id === fieldId ? { ...field, fontSize } : field
              ),
            }
          : layout
      )
    );
  };

  // Handle Update Layout Dimensions
  const handleUpdateLayoutDimensions = (
    layoutId: string,
    width: number,
    height: number,
    columns: number,
    rows: number
  ) => {
    setLayouts(
      layouts.map(layout =>
        layout.id === layoutId
          ? {
              ...layout,
              width,
              height,
              columns,
              rows,
            }
          : layout
      )
    );
  };

  // Handle Toggle Layout Orientation
  const handleToggleOrientation = (layoutId: string) => {
    setLayouts(
      layouts.map(layout =>
        layout.id === layoutId
          ? {
              ...layout,
              orientation: layout.orientation === 'portrait' ? 'landscape' : 'portrait',
            }
          : layout
      )
    );
  };

  // Handle Delete Data Source
  const handleDeleteDataSource = (id: string) => {
    setDataSources(dataSources.filter(ds => ds.id !== id));
    if (selectedDataSource?.id === id) {
      setSelectedDataSource(null);
    }
    toast({
      title: 'Data Source Deleted',
      description: 'Data source removed successfully',
    });
  };

  // Handle Delete Layout
  const handleDeleteLayout = (id: string) => {
    if (layouts.length <= 1) {
      toast({
        title: 'Cannot Delete',
        description: 'You must have at least one layout',
        variant: 'destructive',
      });
      return;
    }
    
    setLayouts(layouts.filter(l => l.id !== id));
    if (selectedLayout?.id === id) {
      setSelectedLayout(layouts[0]);
    }
    toast({
      title: 'Layout Deleted',
      description: 'Layout removed successfully',
    });
  };

  // Save all settings
  const handleSaveSettings = () => {
    try {
      const dataKey = storeId ? `barcodePrintDataSources_${storeId}` : 'barcodePrintDataSources';
      const layoutKey = storeId ? `barcodePrintLayouts_${storeId}` : 'barcodePrintLayouts';
      localStorage.setItem(dataKey, JSON.stringify(dataSources));
      localStorage.setItem(layoutKey, JSON.stringify(layouts));
    } catch {}
    
    toast({
      title: '✓ Settings Saved',
      description: 'All print settings saved successfully',
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5" />
            Barcode Print Settings
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="data-source" className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              Data Source
            </TabsTrigger>
            <TabsTrigger value="layouts" className="flex items-center gap-2">
              <Layout className="h-4 w-4" />
              Layouts
            </TabsTrigger>
            <TabsTrigger value="fields" className="flex items-center gap-2">
              <SettingsIcon className="h-4 w-4" />
              Fields
            </TabsTrigger>
          </TabsList>

          {/* Data Source Tab */}
          <TabsContent value="data-source" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Add File Data Source</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Data Source Name</Label>
                  <Input
                    placeholder="e.g., Product List, Inventory Export"
                    value={newDataSourceName}
                    onChange={(e) => setNewDataSourceName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>File Type</Label>
                  <Select value={dataSourceType} onValueChange={(v: any) => setDataSourceType(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                      <SelectItem value="csv">CSV (.csv)</SelectItem>
                      <SelectItem value="local">Local Database</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Upload File</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept={dataSourceType === 'excel' ? '.xlsx' : '.csv'}
                      onChange={handleFileUpload}
                      className="flex-1"
                    />
                    <Button variant="outline" size="sm">
                      <Upload className="h-4 w-4 mr-2" />
                      Upload
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Add Database Connection</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Host</Label>
                    <Input
                      placeholder="localhost"
                      value={dbConnection.host}
                      onChange={(e) => setDbConnection({ ...dbConnection, host: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Port</Label>
                    <Input
                      type="number"
                      placeholder="5432"
                      value={dbConnection.port}
                      onChange={(e) =>
                        setDbConnection({ ...dbConnection, port: parseInt(e.target.value) })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Database</Label>
                    <Input
                      placeholder="Database name"
                      value={dbConnection.database}
                      onChange={(e) => setDbConnection({ ...dbConnection, database: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Username</Label>
                    <Input
                      placeholder="Username"
                      value={dbConnection.username}
                      onChange={(e) => setDbConnection({ ...dbConnection, username: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Password</Label>
                    <Input
                      type="password"
                      placeholder="Password"
                      value={dbConnection.password}
                      onChange={(e) => setDbConnection({ ...dbConnection, password: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Table Name</Label>
                    <Input
                      placeholder="Table name"
                      value={dbConnection.table}
                      onChange={(e) => setDbConnection({ ...dbConnection, table: e.target.value })}
                    />
                  </div>
                </div>
                <Button onClick={handleSaveDatabaseConnection} className="w-full">
                  Connect to Database
                </Button>
              </CardContent>
            </Card>

            {dataSources.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Connected Data Sources</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {dataSources.map((ds) => (
                    <div
                      key={ds.id}
                      className="flex items-center justify-between p-2 border rounded hover:bg-gray-50"
                    >
                      <div className="flex-1">
                        <p className="font-medium">{ds.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {ds.type === 'database' ? `${ds.type} - ${ds.connection?.table}` : ds.filePath}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteDataSource(ds.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Layouts Tab */}
          <TabsContent value="layouts" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Create New Layout</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Layout Name</Label>
                  <Input
                    placeholder="e.g., Standard Label, Large Label"
                    value={newLayoutName}
                    onChange={(e) => setNewLayoutName(e.target.value)}
                  />
                </div>
                <Button onClick={handleAddLayout} className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Layout
                </Button>
              </CardContent>
            </Card>

            {layouts.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Manage Layouts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {layouts.map((layout, idx) => (
                    <div
                      key={layout.id}
                      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                        selectedLayout?.id === layout.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setSelectedLayout(layout)}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex-1">
                          <p className="font-semibold">{layout.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {layout.width} × {layout.height} {layout.unit} • {layout.columns}×{layout.rows} grid •{' '}
                            {layout.orientation}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteLayout(layout.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>

                      {selectedLayout?.id === layout.id && (
                        <div className="mt-4 space-y-4 pt-4 border-t">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label className="text-xs">Width</Label>
                              <div className="flex gap-2">
                                <Input
                                  type="number"
                                  value={layout.width}
                                  onChange={(e) =>
                                    handleUpdateLayoutDimensions(
                                      layout.id,
                                      parseInt(e.target.value) || layout.width,
                                      layout.height,
                                      layout.columns,
                                      layout.rows
                                    )
                                  }
                                  className="flex-1"
                                />
                                <span className="flex items-center px-2">{layout.unit}</span>
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs">Height</Label>
                              <div className="flex gap-2">
                                <Input
                                  type="number"
                                  value={layout.height}
                                  onChange={(e) =>
                                    handleUpdateLayoutDimensions(
                                      layout.id,
                                      layout.width,
                                      parseInt(e.target.value) || layout.height,
                                      layout.columns,
                                      layout.rows
                                    )
                                  }
                                  className="flex-1"
                                />
                                <span className="flex items-center px-2">{layout.unit}</span>
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs">Columns</Label>
                              <Input
                                type="number"
                                value={layout.columns}
                                onChange={(e) =>
                                  handleUpdateLayoutDimensions(
                                    layout.id,
                                    layout.width,
                                    layout.height,
                                    parseInt(e.target.value) || layout.columns,
                                    layout.rows
                                  )
                                }
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Rows</Label>
                              <Input
                                type="number"
                                value={layout.rows}
                                onChange={(e) =>
                                  handleUpdateLayoutDimensions(
                                    layout.id,
                                    layout.width,
                                    layout.height,
                                    layout.columns,
                                    parseInt(e.target.value) || layout.rows
                                  )
                                }
                              />
                            </div>
                          </div>

                          <div>
                            <Label className="text-xs">Orientation</Label>
                            <Button
                              variant="outline"
                              className="w-full"
                              onClick={() => handleToggleOrientation(layout.id)}
                            >
                              {layout.orientation === 'portrait' ? '📄 Portrait' : '📑 Landscape'}
                            </Button>
                          </div>

                          <div className="text-sm font-medium">Print Order: #{idx + 1}</div>
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Fields Tab */}
          <TabsContent value="fields" className="space-y-4">
            {selectedLayout && (
              <Card>
                <CardHeader>
                  <CardTitle>Fields for: {selectedLayout.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selectedLayout.fields.map((field) => (
                    <div key={field.id} className="flex items-center justify-between p-3 border rounded">
                      <div className="flex items-center gap-3 flex-1">
                        <Checkbox
                          checked={field.enabled}
                          onCheckedChange={() =>
                            handleToggleField(selectedLayout.id, field.id)
                          }
                        />
                        <div className="flex-1">
                          <p className="font-medium">{field.label}</p>
                          <p className="text-sm text-muted-foreground">{field.name}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs">Font:</Label>
                        <Input
                          type="number"
                          min="6"
                          max="20"
                          value={field.fontSize || 8}
                          onChange={(e) =>
                            handleUpdateFieldFontSize(
                              selectedLayout.id,
                              field.id,
                              parseInt(e.target.value)
                            )
                          }
                          className="w-16"
                        />
                        <span className="text-xs">pt</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSaveSettings}>
            Save Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
