const fs = require('fs');
let content = fs.readFileSync('src/components/Stores.tsx', 'utf8');
const startIndex = content.indexOf('{/* My Owned Stores */}');
const endIndex = content.indexOf('{/* Open Store Password Prompt */}');

if (startIndex !== -1 && endIndex !== -1) {
  const replacement = `      <div className="flex flex-col items-center justify-center space-y-6 py-12">
        <div className="bg-primary/5 p-6 rounded-full">
          <StoreIcon className="h-16 w-16 text-primary opacity-80" />
        </div>
        <div className="text-center space-y-2 max-w-md">
          <h3 className="text-2xl font-semibold">Branch Communication</h3>
          <p className="text-muted-foreground text-sm">
            Link with other branches to exchange data, or communicate with them securely via Store Chat.
          </p>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl mt-8">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer group" onClick={() => {
            navigator.clipboard.writeText(currentStoreId || "");
            toast({ title: "Copied!", description: "Branch ID copied to clipboard. Share this with other branches." });
          }}>
            <CardContent className="flex flex-col items-center justify-center p-6 space-y-4 h-full">
              <div className="p-3 bg-primary/10 rounded-full group-hover:scale-110 transition-transform">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-sm">Copy My Branch ID</p>
                <p className="text-xs text-muted-foreground mt-1">Share with others to let them link</p>
              </div>
            </CardContent>
          </Card>
          
          <Card className="hover:border-primary/50 transition-colors cursor-pointer group" onClick={() => setIsLinkDialogOpen(true)}>
            <CardContent className="flex flex-col items-center justify-center p-6 space-y-4 h-full">
              <div className="p-3 bg-primary/10 rounded-full group-hover:scale-110 transition-transform">
                <Link2 className="h-6 w-6 text-primary" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-sm">Link New Branch</p>
                <p className="text-xs text-muted-foreground mt-1">Enter a branch ID to connect</p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:border-primary/50 transition-colors flex items-center justify-center group overflow-hidden relative">
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-background/50 backdrop-blur-[1px]">
               <p className="text-sm font-semibold pointer-events-none text-center px-2">Open Chat from Top Bar</p>
            </div>
            <div className="flex flex-col items-center justify-center p-6 space-y-4 w-full h-full relative">
              <div className="p-3 bg-primary/10 rounded-full group-hover:scale-110 transition-transform">
                <StoreIcon className="h-6 w-6 text-primary" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-sm">Store Chat</p>
                <p className="text-xs text-muted-foreground mt-1">Exchange messages & data</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
`;
  content = content.substring(0, startIndex) + replacement + content.substring(endIndex);
  fs.writeFileSync('src/components/Stores.tsx', content);
  console.log('Successfully replaced Stores UI');
} else {
  console.log('Could not find markers');
}
