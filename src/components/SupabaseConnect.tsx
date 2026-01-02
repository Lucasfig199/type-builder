import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWorkflowStore } from '@/store/workflowStore';
import { Database, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const TABLE_NAME = 'TYPE_BUILDER';

export const SupabaseConnect = () => {
  const { supabaseConfig, setSupabaseConfig } = useWorkflowStore();
  const [url, setUrl] = useState(supabaseConfig.url);
  const [anonKey, setAnonKey] = useState(supabaseConfig.anonKey);
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const handleConnect = async () => {
    if (!url || !anonKey) {
      toast.error('Preencha todos os campos');
      return;
    }

    setIsLoading(true);

    // Test connection by probing the expected table. If it doesn't exist, we block the connection.
    const probeUrl = `${url}/rest/v1/${TABLE_NAME}?select=FLUXO&limit=1`;

    try {
      const response = await fetch(probeUrl, {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
      });

      if (response.ok) {
        setSupabaseConfig({
          url,
          anonKey,
          isConnected: true,
        });
        toast.success('Conectado ao Supabase com sucesso!');
        setOpen(false);
        return;
      }

      if (response.status === 404) {
        toast.error(`Planilha ${TABLE_NAME} não foi encontrada`);
        return;
      }

      toast.error('Erro ao conectar. Verifique as credenciais/permissões.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = () => {
    setSupabaseConfig({
      url: '',
      anonKey: '',
      isConnected: false,
    });
    setUrl('');
    setAnonKey('');
    toast.info('Desconectado do Supabase');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={supabaseConfig.isConnected ? 'default' : 'outline'}
          size="sm"
          className="gap-2"
        >
          <Database className="h-4 w-4" />
          {supabaseConfig.isConnected ? (
            <>
              <CheckCircle className="h-4 w-4 text-green-400" />
              Conectado
            </>
          ) : (
            'Conectar Supabase'
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Integração Supabase
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {supabaseConfig.isConnected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="text-sm">Conectado ao Supabase</span>
              </div>
              <p className="text-sm text-muted-foreground">
                URL: {supabaseConfig.url.substring(0, 40)}...
              </p>
              <Button
                variant="destructive"
                onClick={handleDisconnect}
                className="w-full"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Desconectar
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="supabase-url">URL do Projeto</Label>
                <Input
                  id="supabase-url"
                  placeholder="https://seu-projeto.supabase.co"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="anon-key">Anon Key</Label>
                <Input
                  id="anon-key"
                  type="password"
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={anonKey}
                  onChange={(e) => setAnonKey(e.target.value)}
                />
              </div>
              <Button
                onClick={handleConnect}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Conectando...
                  </>
                ) : (
                  'Conectar'
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                A planilha {TABLE_NAME} precisa existir no Supabase para conectar.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};