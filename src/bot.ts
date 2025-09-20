import Mineflayer from 'mineflayer';
import { sleep, getRandom } from "./utils.js";
import CONFIG from "../config.json" with {type: 'json'};

let loop: NodeJS.Timeout;
let bot: Mineflayer.Bot;

const disconnect = (): void => {
        clearInterval(loop);
        bot?.quit?.();
        bot?.end?.();
};
const reconnect = async (): Promise<void> => {
        console.log(`Trying to reconnect in ${CONFIG.action.retryDelay / 1000} seconds...\n`);

        disconnect();
        await sleep(CONFIG.action.retryDelay);
        createBot();
        return;
};

const createBot = (): void => {
        // Bot configuration with optional skin support
        const botConfig: any = {
                host: CONFIG.client.host,
                port: +CONFIG.client.port,
                version: '1.20.4' // Specify Minecraft version
        };
        
        // Check if Microsoft account is enabled for custom skin
        if (CONFIG.client.microsoftAccount?.enabled && CONFIG.client.microsoftAccount.email) {
                console.log('🎨 Using Microsoft account for custom skin...');
                botConfig.username = CONFIG.client.microsoftAccount.email;
                botConfig.password = CONFIG.client.microsoftAccount.password;
                botConfig.auth = 'microsoft';
        } else if (CONFIG.client.randomSkin?.enabled && CONFIG.client.randomSkin.skins?.length > 0) {
                // Use random skin from preset list
                const randomSkin = CONFIG.client.randomSkin.skins[Math.floor(Math.random() * CONFIG.client.randomSkin.skins.length)];
                console.log(`🎲 Using random skin: ${randomSkin}`);
                botConfig.username = randomSkin;
                botConfig.auth = CONFIG.client.auth || 'offline';
                if (CONFIG.client.password && CONFIG.client.auth !== 'offline') {
                        botConfig.password = CONFIG.client.password;
                }
        } else {
                console.log('🤖 Using offline mode (default Steve skin)');
                botConfig.username = CONFIG.client.username;
                botConfig.auth = CONFIG.client.auth || 'offline';
                if (CONFIG.client.password && CONFIG.client.auth !== 'offline') {
                        botConfig.password = CONFIG.client.password;
                }
        }
        
        bot = Mineflayer.createBot(botConfig);


        bot.once('error', error => {
                console.error(`AFKBot got an error: ${error}`);
        });
        bot.once('kicked', rawResponse => {
                console.error(`\n\nAFKbot is disconnected: ${rawResponse}`);
        });
        bot.once('end', () => void reconnect());

        bot.once('spawn', () => {
                // Auto-register/login for AuthMe plugin
                setTimeout(() => {
                        if (CONFIG.client.isRegistered) {
                                console.log('Attempting to login with AuthMe...');
                                bot.chat(`/login ${CONFIG.client.password}`);
                        } else {
                                console.log('Attempting to register with AuthMe...');
                                bot.chat(`/register ${CONFIG.client.password} ${CONFIG.client.password}`);
                        }
                }, 2000); // Wait 2 seconds before sending command
                
                let moveCount = 0;
                let targetDistance = 30 + Math.floor(Math.random() * 50); // Initial random distance 30-80 (much longer!)
                let currentDirection: Mineflayer.ControlState = 'forward';
                let isGoingBack = false;
                let isFollowingPlayer = false;
                let targetPlayerPosition: any = null;
                let followingPlayerName = '';
                let originalPosition: any = null;
                let lastPlayerCheckTime = 0;
                let lastPlayerDetected = '';
                let isStandingStill = false;
                let waitingForServerResponse = false;
                let serverQuestionAsker = '';
                let responseTimeout: NodeJS.Timeout | null = null;
                let currentSprintState = false; // Track sprint state to reduce toggling
                let lastJumpTime = 0; // Track last jump time for cooldowns
                
                // Chat message every 5 minutes
                const chatInterval = setInterval(() => {
                        console.log('Sending love message...');
                        bot.chat('wow I love this server');
                }, 5 * 60 * 1000); // 5 minutes
                
                // Listen for chat messages to detect "hi [playername]" commands
                bot.on('chat', (username, message) => {
                        // ALWAYS LOG ALL CHAT MESSAGES (as requested by user)
                        console.log(`🗨️ CHAT: ${username}: ${message}`);
                        console.log(`🔧 DEBUG: waitingForServerResponse=${waitingForServerResponse}, serverQuestionAsker="${serverQuestionAsker}"`);
                        
                        // Don't react to our own messages
                        if (username === bot.username) return;
                        
                        // Additional debugging for waiting state
                        if (waitingForServerResponse) {
                                console.log(`🔍 WAITING FOR RESPONSE from "${serverQuestionAsker}", got message from "${username}"`);
                                console.log(`🔍 Case-insensitive check: "${username.toLowerCase()}" === "${serverQuestionAsker.toLowerCase()}" = ${username.toLowerCase() === serverQuestionAsker.toLowerCase()}`);
                        }
                        
                        // Filter out system/plugin messages FIRST (ignore messages from bots/plugins)
                        const systemUsernames = ['grim', 'clearlag', 'fastlogin', 'owner', 'console', 'server', 'authme', 'essentials'];
                        const isSystemMessage = systemUsernames.some(sys => username.toLowerCase().includes(sys.toLowerCase()));
                        
                        if (isSystemMessage) {
                                console.log(`🤖 SYSTEM MESSAGE - ignoring: ${username}: ${message}`);
                                return;
                        }
                        
                        // Check if waiting for server love response (FIXED: case-insensitive comparison)
                        if (waitingForServerResponse && username.toLowerCase() === serverQuestionAsker.toLowerCase()) {
                                const response = message.toLowerCase().trim();
                                console.log(`🔍 Checking response "${response}" from ${username}`);
                                
                                if (response.includes('yes') || response === 'y' || response.includes('yeah') || response.includes('love') || response.includes('yep') || response.includes('yup') || response.includes('hi') || response.includes('hello') || response.includes('hey')) {
                                        console.log(`😊 ${username} loves the server! Responding positively.`);
                                        bot.chat(`i loved this server very much !`);
                                        waitingForServerResponse = false;
                                        isStandingStill = false;
                                        serverQuestionAsker = '';
                                        if (responseTimeout) clearTimeout(responseTimeout);
                                } else if (response.includes('no') || response === 'n' || response.includes('hate') || response.includes('bad') || response.includes('nah')) {
                                        console.log(`😡 ${username} doesn't love the server. Getting angry!`);
                                        bot.chat(`GET OUT YOU DONT BELONG TO THIS SERVER IF YOU DONT LOVE IT I HATE U`);
                                        waitingForServerResponse = false;
                                        isStandingStill = false;
                                        serverQuestionAsker = '';
                                        if (responseTimeout) clearTimeout(responseTimeout);
                                } else {
                                        console.log(`❓ Unknown response from ${username}: "${response}"`);
                                        bot.chat(`${username} just say yes or no! do u love the server?`);
                                }
                                return;
                        }
                        
                        // Check if someone is greeting the bot directly (including "hi AFKbot123")
                        const botGreeting = message.toLowerCase().match(/\b(hi|hello|hey)\b.*\b(afk|bot|afkbot)\b/i) || 
                                          message.toLowerCase().match(/^(hi|hello|hey)$/i) ||
                                          (message.toLowerCase().includes(bot.username.toLowerCase()) && 
                                           message.toLowerCase().match(/\b(hi|hello|hey|sup|yo)\b/i)) ||
                                          message.toLowerCase().includes('hi afkbot123') ||
                                          message.toLowerCase().includes('hello afkbot123') ||
                                          message.toLowerCase().includes('hey afkbot123');
                        
                        if (botGreeting) {
                                console.log(`👋 ${username} is greeting the bot! Responding and moving to them...`);
                                
                                // Find the player who greeted us
                                const greetingPlayer = Object.values(bot.players).find(player => 
                                        player.username && 
                                        player.username.toLowerCase() === username.toLowerCase() &&
                                        player.entity &&
                                        player.username !== bot.username
                                );
                                
                                if (greetingPlayer) {
                                        // Set following state to go to the person who greeted us
                                        isFollowingPlayer = true;
                                        targetPlayerPosition = greetingPlayer.entity.position.clone();
                                        followingPlayerName = greetingPlayer.username;
                                        originalPosition = bot.entity.position.clone();
                                        
                                        // Respond with exact greeting format
                                        const isExactBotGreeting = message.toLowerCase().includes('hi afkbot123') || 
                                                                  message.toLowerCase().includes('hello afkbot123') ||
                                                                  message.toLowerCase().includes('hey afkbot123');
                                        
                                        const responses = isExactBotGreeting ? 
                                                [`hi ${username}`] : // Exact response for "hi AFKbot123"
                                                [
                                                        `Hi ${username}!`,
                                                        `Hello ${username}!`,
                                                        `Hey ${username}!`,
                                                        `Hi ${username}! Coming to you!`
                                                ];
                                        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
                                        bot.chat(randomResponse);
                                } else {
                                        // Even if we can't find them, still respond
                                        bot.chat(`Hi ${username}! I hear you but can't see you!`);
                                }
                                return;
                        }
                        
                        // Check if message contains "hi" followed by a player name (original functionality)
                        const hiMatch = message.toLowerCase().match(/^hi\s+(\w+)$/i);
                        if (hiMatch) {
                                const targetPlayerName = hiMatch[1];
                                
                                // Skip if they're trying to greet the bot (handled above)
                                if (targetPlayerName.toLowerCase().includes('afk') || 
                                    targetPlayerName.toLowerCase().includes('bot') ||
                                    targetPlayerName.toLowerCase() === bot.username.toLowerCase()) {
                                        return;
                                }
                                
                                // Find the target player
                                const targetPlayer = Object.values(bot.players).find(player => 
                                        player.username && 
                                        player.username.toLowerCase() === targetPlayerName.toLowerCase() &&
                                        player.entity &&
                                        player.username !== bot.username
                                );
                                
                                if (targetPlayer) {
                                        console.log(`👋 ${username} said hi to ${targetPlayer.username}! Moving to them...`);
                                        
                                        // Set following state
                                        isFollowingPlayer = true;
                                        targetPlayerPosition = targetPlayer.entity.position.clone();
                                        followingPlayerName = targetPlayer.username;
                                        originalPosition = bot.entity.position.clone();
                                        
                                        // Respond in chat with chance to ask about server
                                        const serverQuestionChance = Math.random() < 0.3; // 30% chance
                                        if (serverQuestionChance) {
                                                bot.chat(`Hi ${targetPlayer.username}! do u love the server?`);
                                                waitingForServerResponse = true;
                                                serverQuestionAsker = targetPlayer.username;
                                        } else {
                                                bot.chat(`Hi ${targetPlayer.username}! Coming to you! 👋`);
                                        }
                                } else {
                                        console.log(`❓ Player '${targetPlayerName}' not found or not online`);
                                }
                        }
                });
                
                // Alternative chat listener for modern servers (fallback)
                bot.on('message', (jsonMsg) => {
                        try {
                                const msgText = jsonMsg.toString();
                                console.log(`📄 RAW MESSAGE: ${msgText}`);
                                
                                // Check if this is just a simple response (like "YES", "yes", "no") when waiting
                                if (waitingForServerResponse && msgText && typeof msgText === 'string') {
                                        const simpleResponse = msgText.toLowerCase().trim();
                                        if (simpleResponse === 'yes' || simpleResponse === 'y' || simpleResponse === 'yeah' || 
                                            simpleResponse === 'yep' || simpleResponse === 'yup' || simpleResponse === 'love' ||
                                            simpleResponse === 'no' || simpleResponse === 'n' || simpleResponse === 'hate' || 
                                            simpleResponse === 'nah' || simpleResponse === 'bad') {
                                                console.log(`🎯 SIMPLE RESPONSE DETECTED: "${simpleResponse}" (assuming from ${serverQuestionAsker})`);
                                                
                                                if (simpleResponse.includes('yes') || simpleResponse === 'y' || simpleResponse === 'yeah' || simpleResponse === 'love' || simpleResponse === 'yep' || simpleResponse === 'yup') {
                                                        console.log(`😊 Player loves the server! Responding positively.`);
                                                        bot.chat(`i loved this server very much !`);
                                                } else {
                                                        console.log(`😡 Player doesn't love the server. Getting angry!`);
                                                        bot.chat(`GET OUT YOU DONT BELONG TO THIS SERVER IF YOU DONT LOVE IT I HATE U`);
                                                }
                                                
                                                // Always reset the waiting state and keep moving!
                                                waitingForServerResponse = false;
                                                isStandingStill = false;
                                                serverQuestionAsker = '';
                                                if (responseTimeout) clearTimeout(responseTimeout);
                                                return;
                                        }
                                }
                                
                                // Extract username and message from various formats
                                const chatMatch = msgText.match(/<([^>]+)>\s*(.+)|([^:]+):\s*(.+)/);
                                if (chatMatch) {
                                        const username = chatMatch[1] || chatMatch[3];
                                        const message = chatMatch[2] || chatMatch[4];
                                        
                                        if (username && message) {
                                                console.log(`📧 PARSED MESSAGE: ${username}: ${message}`);
                                                
                                                if (waitingForServerResponse) {
                                                        console.log(`🔄 FALLBACK: Checking if "${username.toLowerCase()}" === "${serverQuestionAsker.toLowerCase()}"`);
                                                }
                                        }
                                        
                                        if (waitingForServerResponse && username && message && username.toLowerCase() === serverQuestionAsker.toLowerCase()) {
                                                console.log(`🔄 FALLBACK: Detected response from ${username}: "${message}"`);
                                                // Process the response using same logic
                                                const response = message.toLowerCase().trim();
                                                
                                                if (response.includes('yes') || response === 'y' || response.includes('yeah') || response.includes('love') || response.includes('yep') || response.includes('yup') || response.includes('hi') || response.includes('hello') || response.includes('hey')) {
                                                        console.log(`😊 ${username} loves the server! (via fallback)`);
                                                        bot.chat(`i loved this server very much !`);
                                                        waitingForServerResponse = false;
                                                        isStandingStill = false;
                                                        serverQuestionAsker = '';
                                                        if (responseTimeout) clearTimeout(responseTimeout);
                                                } else if (response.includes('no') || response === 'n' || response.includes('hate') || response.includes('bad') || response.includes('nah')) {
                                                        console.log(`😡 ${username} doesn't love the server! (via fallback)`);
                                                        bot.chat(`GET OUT YOU DONT BELONG TO THIS SERVER IF YOU DONT LOVE IT I HATE U`);
                                                        waitingForServerResponse = false;
                                                        isStandingStill = false;
                                                        serverQuestionAsker = '';
                                                        if (responseTimeout) clearTimeout(responseTimeout);
                                                }
                                        }
                                }
                        } catch (error) {
                                // Ignore parsing errors
                        }
                });
                
                const findNearbyPlayer = () => {
                        const players = Object.values(bot.players).filter(player => 
                                player.entity && 
                                player.username !== bot.username &&
                                player.entity.position.distanceTo(bot.entity.position) <= 60 // Increased to 60 blocks
                        );
                        return players.length > 0 ? players[Math.floor(Math.random() * players.length)] : null;
                };

                const isWallInDirection = (relativeDirection: string): boolean => {
                        const currentPos = bot.entity.position;
                        const yaw = bot.entity.yaw;
                        
                        // Calculate correct direction vectors based on bot's orientation
                        let offsetX = 0, offsetZ = 0;
                        
                        switch(relativeDirection) {
                                case 'forward':
                                        offsetX = -Math.sin(yaw);
                                        offsetZ = -Math.cos(yaw);
                                        break;
                                case 'back':
                                        offsetX = Math.sin(yaw);
                                        offsetZ = Math.cos(yaw);
                                        break;
                                case 'left':
                                        offsetX = -Math.cos(yaw);
                                        offsetZ = Math.sin(yaw);
                                        break;
                                case 'right':
                                        offsetX = Math.cos(yaw);
                                        offsetZ = -Math.sin(yaw);
                                        break;
                                default:
                                        return false;
                        }
                        
                        // Check both foot level and head level
                        const checkPosFeet = currentPos.offset(offsetX, 0, offsetZ);
                        const checkPosHead = currentPos.offset(offsetX, 1, offsetZ);
                        
                        const blockFeet = bot.blockAt(checkPosFeet);
                        const blockHead = bot.blockAt(checkPosHead);
                        
                        // Check if blocks are solid
                        const feetSolid = blockFeet && blockFeet.boundingBox === 'block';
                        const headSolid = blockHead && blockHead.boundingBox === 'block';
                        
                        // If only feet level is blocked (head is clear), it might be stairs - try to jump ONCE
                        if (feetSolid && !headSolid && !isMoving) {
                                console.log('🪜 Stairs detected! Jumping up...');
                                return false; // Don't treat as wall, let normal movement handle it
                        }
                        
                        // True wall if both levels are blocked
                        return Boolean(feetSolid || headSolid);
                };

                const avoidWall = async (): Promise<void> => {
                        console.log('🧱 Wall detected! Turning right until clear...');
                        
                        // Keep turning right until we find a clear direction
                        let attempts = 0;
                        while (attempts < 8) { // Max 8 attempts (45 degrees each = 360 degrees)
                                const currentYaw = bot.entity.yaw;
                                const newYaw = currentYaw + (Math.PI / 4); // Turn right 45 degrees
                                await bot.look(newYaw, 0, true);
                                
                                // Check if path is clear in front after turning
                                if (!isWallInDirection('forward')) {
                                        console.log('✅ Found clear path after turning right!');
                                        return; // Exit immediately when clear path found
                                }
                                
                                attempts++;
                                await sleep(100); // Short delay between turns
                        }
                        
                        if (attempts >= 8) {
                                console.log('⚠️ Stuck! Jumping and moving forward to clear obstacle...');
                                bot.setControlState('jump', true);
                                bot.setControlState('forward', true);
                                await sleep(800);
                                bot.clearControlStates();
                        }
                };

                // Movement lock to prevent overlapping movements
                let isMoving = false;

                const moveTowardsPlayer = async (targetPos: any) => {
                        const botPos = bot.entity.position;
                        const dx = targetPos.x - botPos.x;
                        const dz = targetPos.z - botPos.z;
                        
                        // Look towards target first
                        const yaw = Math.atan2(-dx, -dz);
                        await bot.look(yaw, 0, true);
                        
                        // After looking at target, check if forward path is blocked
                        if (isWallInDirection('forward')) {
                                console.log('🧱 Wall blocking path to player! Avoiding wall and returning to normal movement...');
                                await avoidWall();
                                isFollowingPlayer = false;
                                targetPlayerPosition = null;
                                followingPlayerName = '';
                                return;
                        }
                        
                        // Move forward towards target (since we're already facing the target)
                        const halfChance: boolean = Math.random() < 0.5;
                        
                        // Shift when approaching player
                        bot.setControlState('sneak', true);
                        bot.setControlState('sprint', halfChance);
                        bot.setControlState('forward', true);
                        
                        await sleep(CONFIG.action.holdDuration);
                        bot.clearControlStates();
                        
                        // Check distance after movement using current position
                        const newBotPos = bot.entity.position;
                        const distance = newBotPos.distanceTo(targetPos);
                        
                        if (distance < 3) {
                                console.log(`✅ Reached ${followingPlayerName}! Hello! 👋`);
                                console.log(`💬 SENDING CHAT: Hello ${followingPlayerName}! do u love the server?`);
                                
                                // ALWAYS ask about server love - force it to work  
                                try {
                                        bot.chat(`Hello ${followingPlayerName}! do u love the server?`);
                                        console.log(`✅ Chat message sent successfully!`);
                                        waitingForServerResponse = true;
                                        serverQuestionAsker = followingPlayerName;
                                        
                                        // Set 20-second timer - bot keeps moving naturally while waiting
                                        console.log(`⏱️ Waiting 20 seconds for ${followingPlayerName} to answer (but keeps moving naturally)...`);
                                        responseTimeout = setTimeout(() => {
                                                console.log(`⏰ 20-second timeout - stopping wait for ${serverQuestionAsker}`);
                                                waitingForServerResponse = false;
                                                serverQuestionAsker = '';
                                                responseTimeout = null;
                                        }, 20000);
                                } catch (error) {
                                        console.log(`❌ Chat error: ${error}`);
                                        bot.chat(`Hello ${followingPlayerName}!`);
                                }
                                
                                // Shift when greeting the player
                                bot.setControlState('sneak', true);
                                await sleep(2000); // Hold shift for 2 seconds when greeting
                                bot.setControlState('sneak', false);
                                isFollowingPlayer = false;
                                targetPlayerPosition = null;
                                followingPlayerName = '';
                                lastPlayerDetected = ''; // Reset so we can detect them again later
                        } else if (distance > 100) {
                                console.log(`🚫 Target too far away (${distance.toFixed(2)} blocks)! Giving up chase...`);
                                bot.chat(`Sorry ${followingPlayerName}, you're too far away! 😅`);
                                isFollowingPlayer = false;
                                targetPlayerPosition = null;
                                followingPlayerName = '';
                                lastPlayerDetected = ''; // Reset so we can detect them again later
                        }
                };

                const changePos = async (): Promise<void> => {
                        // Only prevent overlapping movements, NEVER stop moving completely
                        if (isMoving) {
                                return;
                        }
                        isMoving = true;
                        
                        try {
                        // 5% chance to spot and follow a player (only when not already following) with 30-second cooldown
                        const now = Date.now();
                        if (!isFollowingPlayer && Math.random() < 0.05 && (now - lastPlayerCheckTime) > 30000) {
                                lastPlayerCheckTime = now;
                                const nearbyPlayer = findNearbyPlayer();
                                if (nearbyPlayer && nearbyPlayer.username !== lastPlayerDetected) {
                                        isFollowingPlayer = true;
                                        targetPlayerPosition = nearbyPlayer.entity.position.clone();
                                        followingPlayerName = nearbyPlayer.username;
                                        originalPosition = bot.entity.position.clone();
                                        lastPlayerDetected = nearbyPlayer.username;
                                        
                                        console.log(`👀 Spotted player ${followingPlayerName}! Following them...`);
                                        
                                        // 60% chance to ask about server love
                                        const serverQuestionChance = Math.random() < 0.60;
                                        if (serverQuestionChance) {
                                                bot.chat(`${followingPlayerName}! do u love the server?`);
                                                waitingForServerResponse = true;
                                                serverQuestionAsker = followingPlayerName;
                                        } else {
                                                bot.chat(`${followingPlayerName}!`);
                                        }
                                        
                                        // Shift when looking at the player
                                        bot.setControlState('sneak', true);
                                        await bot.lookAt(nearbyPlayer.entity.position.offset(0, nearbyPlayer.entity.height, 0));
                                        await sleep(1000); // Hold shift for 1 second
                                        bot.setControlState('sneak', false);
                                        
                                        await moveTowardsPlayer(targetPlayerPosition);
                                        return;
                                }
                        }
                        
                        // If currently following a player, continue following
                        if (isFollowingPlayer && targetPlayerPosition) {
                                // Update target player position if player is still online
                                const currentTarget = Object.values(bot.players).find(player => 
                                        player.username === followingPlayerName && 
                                        player.entity
                                );
                                
                                if (currentTarget) {
                                        // Update to current position for better tracking
                                        targetPlayerPosition = currentTarget.entity.position.clone();
                                        await moveTowardsPlayer(targetPlayerPosition);
                                } else {
                                        console.log(`❌ Target player ${followingPlayerName} is no longer online. Stopping follow.`);
                                        isFollowingPlayer = false;
                                        targetPlayerPosition = null;
                                        followingPlayerName = '';
                                }
                                return;
                        }
                        
                        // Random human-like movement behavior
                        moveCount++;
                        
                        // Change direction when target distance reached or random chance (ONLY 3% now!)
                        if (moveCount >= targetDistance || Math.random() < 0.03) {
                                const directions = ['forward', 'left', 'right', 'back'];
                                const newDirection = getRandom(directions);
                                
                                console.log(`🎯 Randomly changing direction to: ${newDirection}`);
                                
                                // Calculate new direction angle
                                let angleChange = 0;
                                switch(newDirection) {
                                        case 'left':
                                                angleChange = -Math.PI / 2; // Turn left 90 degrees
                                                break;
                                        case 'right':
                                                angleChange = Math.PI / 2; // Turn right 90 degrees
                                                break;
                                        case 'back':
                                                angleChange = Math.PI; // Turn around 180 degrees
                                                break;
                                        case 'forward':
                                        default:
                                                angleChange = 0; // Continue forward
                                                break;
                                }
                                
                                if (angleChange !== 0) {
                                        const currentYaw = bot.entity.yaw;
                                        await bot.look(currentYaw + angleChange, 0, true);
                                }
                                
                                // Reset movement counter with random distance (30-80 moves - much longer!)
                                targetDistance = 30 + Math.floor(Math.random() * 50);
                                moveCount = 0;
                                console.log(`🎲 Will move ${targetDistance} steps in this direction`);
                        }
                        
                        // Random chance to pause and do something (10% chance) - NO MORE SNEAKING
                        if (Math.random() < 0.10) {
                                const actions = ['pause', 'jump', 'spin'];
                                const action = getRandom(actions);
                                
                                switch(action) {
                                        case 'pause':
                                                console.log('⏸️ Taking a random pause...');
                                                await sleep(1000 + Math.random() * 2000); // Pause 1-3 seconds
                                                return;
                                        case 'jump':
                                                console.log('🦘 Random jump!');
                                                bot.setControlState('jump', true);
                                                await sleep(300);
                                                bot.setControlState('jump', false);
                                                break;
                                        case 'spin':
                                                console.log('🌀 Spinning around!');
                                                const currentYaw = bot.entity.yaw;
                                                const randomSpin = Math.random() * Math.PI * 2; // Random full spin
                                                await bot.look(currentYaw + randomSpin, 0, true);
                                                break;
                                }
                        }
                        
                        // Check for wall collision
                        if (isWallInDirection('forward')) {
                                await avoidWall();
                                return; // Skip this movement cycle to allow the new direction to take effect
                        }
                        
                        // Check if bot is in water and needs to swim
                        const currentBlock = bot.blockAt(bot.entity.position);
                        const isInWater = currentBlock && (currentBlock.name === 'water' || currentBlock.name === 'flowing_water');
                        
                        if (isInWater) {
                                console.log('🏊 In water! Swimming to surface...');
                                bot.setControlState('jump', true);
                                bot.setControlState('forward', true);
                                await sleep(100);
                                bot.clearControlStates();
                                return;
                        }
                        
                        // Batch movement approach - hold actions for multiple steps to reduce entity action spam
                        if (!currentSprintState || moveCount % 8 === 0) { // Change sprint state every 8 steps or first time
                                currentSprintState = Math.random() < 0.08; // 8% chance to sprint (very low to avoid violations)
                                console.log(`🚶 Moving${currentSprintState ? " (sprinting batch)" : " (walking batch)"} (Step ${moveCount})`);
                                bot.setControlState('sprint', currentSprintState);
                        } else {
                                console.log(`🚶 Moving${currentSprintState ? " (sprinting)" : ""} (Step ${moveCount})`);
                        }
                        
                        // Very rare jumping - only when sprinting and with long cooldowns
                        const timeSinceLastJump = Date.now() - (lastJumpTime || 0);
                        if (currentSprintState && Math.random() < 0.03 && timeSinceLastJump > 8000) { // 3% chance, 8s cooldown
                                bot.setControlState('jump', true);
                                lastJumpTime = Date.now();
                                console.log('🦘 Natural jump!');
                        }
                        
                        // Set forward movement
                        bot.setControlState('forward', true);
                        
                        // Very subtle head movements - much less frequent 
                        if (Math.random() < 0.05) { // Only 5% chance for very natural feel
                                const currentYaw = bot.entity.yaw;
                                const currentPitch = bot.entity.pitch;
                                
                                // Tiny, realistic head adjustments
                                const yawAdjustment = (Math.random() - 0.5) * 0.2; // ±6 degrees (very small)
                                const pitchAdjustment = (Math.random() - 0.5) * 0.15; // ±4 degrees
                                
                                const newYaw = currentYaw + yawAdjustment;
                                const newPitch = Math.max(-1.0, Math.min(1.0, currentPitch + pitchAdjustment));
                                
                                bot.look(newYaw, newPitch, false);
                        }

                        // Much longer movement duration to reduce packet spam
                        const moveDuration = 600 + Math.random() * 400; // 600-1000ms per step
                        await sleep(moveDuration);
                        bot.clearControlStates();
                        } finally {
                                isMoving = false;
                        }
                        return;
                };
                
                const changeView = async (): Promise<void> => {
                        // Don't interfere with movement or wall avoidance
                        if (isMoving) return;
                        
                        // Much less frequent looking around (5% chance to reduce violations)
                        if (Math.random() < 0.05) {
                                const lookActions = [
                                        'look_left', 'look_right', 'look_up', 'look_down', 
                                        'look_around', 'check_behind', 'scan_horizon'
                                ];
                                const action = getRandom(lookActions);
                                
                                const currentYaw = bot.entity.yaw;
                                const currentPitch = bot.entity.pitch;
                                
                                let newYaw = currentYaw;
                                let newPitch = currentPitch;
                                
                                switch(action) {
                                        case 'look_left':
                                                console.log('👀 Looking left...');
                                                newYaw = currentYaw - (Math.PI * 0.3); // Turn left ~54 degrees
                                                break;
                                        case 'look_right':
                                                console.log('👀 Looking right...');
                                                newYaw = currentYaw + (Math.PI * 0.3); // Turn right ~54 degrees
                                                break;
                                        case 'look_up':
                                                console.log('👀 Looking up at sky...');
                                                newPitch = -0.5; // Look up
                                                break;
                                        case 'look_down':
                                                console.log('👀 Looking down at ground...');
                                                newPitch = 0.5; // Look down
                                                break;
                                        case 'look_around':
                                                console.log('👀 Looking around randomly...');
                                                newYaw = currentYaw + (Math.random() - 0.5) * Math.PI; // Random wide turn
                                                newPitch = (Math.random() - 0.5) * 0.8; // Random pitch
                                                break;
                                        case 'check_behind':
                                                console.log('👀 Checking behind...');
                                                newYaw = currentYaw + Math.PI * 0.8; // Look mostly behind
                                                break;
                                        case 'scan_horizon':
                                                console.log('👀 Scanning horizon...');
                                                newYaw = currentYaw + (Math.random() - 0.5) * (Math.PI * 0.6); // Wide scan
                                                newPitch = -0.1; // Slightly up for horizon
                                                break;
                                }
                                
                                await bot.look(newYaw, newPitch, true);
                                
                                // After looking around, gradually return to normal view over 1-2 seconds
                                setTimeout(async () => {
                                        const returnYaw = currentDirection === 'forward' ? currentYaw : currentYaw + Math.PI;
                                        await bot.look(returnYaw, 0, false);
                                }, 1000 + Math.random() * 1000);
                        }
                };
                
                // Look around every 3-7 seconds (randomly)
                const lookAroundInterval = setInterval(async () => {
                        await changeView();
                }, 3000 + Math.random() * 4000);
                
                loop = setInterval(() => {
                        changePos();
                }, CONFIG.action.holdDuration);
                
                // Clean up intervals when bot ends
                bot.once('end', () => {
                        if (lookAroundInterval) clearInterval(lookAroundInterval);
                        if (chatInterval) clearInterval(chatInterval);
                        if (loop) clearInterval(loop);
                });
        });
        bot.once('login', () => {
                console.log(`AFKBot logged in ${bot.username}\n\n`);
        });
};



export default (): void => {
        createBot();
};