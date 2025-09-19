import HTTP from 'node:http';

const PORT = process.env.PORT || 5000;
const server = HTTP.createServer((request, response) => {
        response.writeHead(200, {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "*", 
                "Content-Type": "text/html"
        } as const);
        response.end("<h3>Aterbot is running! 🤖</h3><p>Minecraft AFK Bot is active and monitoring for players.</p>");
});

export default (): void => {
        server.listen(Number(PORT), "0.0.0.0", () => console.log(`Server ready on 0.0.0.0:${PORT}`));
};