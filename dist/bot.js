import Mineflayer from 'mineflayer';
import { Vec3 } from 'vec3';
import { sleep, getRandom } from "./utils.js";
import CONFIG from "../config.json" with { type: 'json' };
let loop;
let bot;
const disconnect = () => {
    clearInterval(loop);
    bot?.quit?.();
    bot?.end?.();
};
const reconnect = async () => {
    console.log(`Trying to reconnect in ${CONFIG.action.retryDelay / 1000} seconds...\n`);
    disconnect();
    await sleep(CONFIG.action.retryDelay);
    createBot();
    return;
};
const createBot = () => {
    // Bot configuration with optional skin support
    const botConfig = {
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
    }
    else if (CONFIG.client.randomSkin?.enabled && CONFIG.client.randomSkin.skins?.length > 0) {
        // Use random skin from preset list
        const randomSkin = CONFIG.client.randomSkin.skins[Math.floor(Math.random() * CONFIG.client.randomSkin.skins.length)];
        console.log(`🎲 Using random skin: ${randomSkin}`);
        botConfig.username = randomSkin;
        botConfig.auth = CONFIG.client.auth || 'offline';
        if (CONFIG.client.password && CONFIG.client.auth !== 'offline') {
            botConfig.password = CONFIG.client.password;
        }
    }
    else {
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
            }
            else {
                console.log('Attempting to register with AuthMe...');
                bot.chat(`/register ${CONFIG.client.password} ${CONFIG.client.password}`);
            }
        }, 2000); // Wait 2 seconds before sending command
        let moveCount = 0;
        let targetDistance = 30 + Math.floor(Math.random() * 50); // Initial random distance 30-80 (much longer!)
        let currentDirection = 'forward';
        let isGoingBack = false;
        let isFollowingPlayer = false;
        let targetPlayerPosition = null;
        let followingPlayerName = '';
        let originalPosition = null;
        let lastPlayerCheckTime = 0;
        let lastPlayerDetected = '';
        let isStandingStill = false;
        let waitingForServerResponse = false;
        let serverQuestionAsker = '';
        let responseTimeout = null;
        let currentSprintState = false; // Track sprint state to reduce toggling
        let lastJumpTime = 0; // Track last jump time for cooldowns
        // Ask closest player about server love every 5 minutes
        const chatInterval = setInterval(() => {
            const closestPlayer = getClosestPlayer(30);
            if (closestPlayer && !waitingForServerResponse) {
                console.log(`Asking closest player ${closestPlayer.username} about server love...`);
                bot.chat(`${closestPlayer.username}, do u love the server?`);
                waitingForServerResponse = true;
                serverQuestionAsker = closestPlayer.username;
                // Set timeout to clear waiting state if no response
                if (responseTimeout)
                    clearTimeout(responseTimeout);
                responseTimeout = setTimeout(() => {
                    console.log('No response received, resuming normal behavior');
                    waitingForServerResponse = false;
                    serverQuestionAsker = '';
                }, 30000); // 30 second timeout
            }
            else {
                console.log('No players nearby or waiting for response, sending general love message...');
                bot.chat('wow I love this server');
            }
        }, 5 * 60 * 1000); // 5 minutes
        // Listen for chat messages to detect "hi [playername]" commands
        bot.on('chat', (username, message) => {
            // ALWAYS LOG ALL CHAT MESSAGES (as requested by user)
            console.log(`🗨️ CHAT: ${username}: ${message}`);
            console.log(`🔧 DEBUG: waitingForServerResponse=${waitingForServerResponse}, serverQuestionAsker="${serverQuestionAsker}"`);
            // Don't react to our own messages
            if (username === bot.username)
                return;
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
                    bot.chat(`me too i loved this server very much`);
                    waitingForServerResponse = false;
                    isStandingStill = false;
                    serverQuestionAsker = '';
                    if (responseTimeout)
                        clearTimeout(responseTimeout);
                }
                else if (response.includes('no') || response === 'n' || response.includes('hate') || response.includes('bad') || response.includes('nah')) {
                    console.log(`😡 ${username} doesn't love the server. Getting angry!`);
                    bot.chat(`GET OUT YOU DONT BELONG TO THIS SERVER IF YOU DONT LOVE IT I HATE U`);
                    waitingForServerResponse = false;
                    isStandingStill = false;
                    serverQuestionAsker = '';
                    if (responseTimeout)
                        clearTimeout(responseTimeout);
                }
                else {
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
                const greetingPlayer = Object.values(bot.players).find(player => player.username &&
                    player.username.toLowerCase() === username.toLowerCase() &&
                    player.entity &&
                    player.username !== bot.username);
                let targetPlayer = greetingPlayer;
                // If we can't find the greeter, use the closest player as fallback
                if (!targetPlayer) {
                    targetPlayer = getClosestPlayer(30);
                    if (targetPlayer) {
                        console.log(`Could not find ${username}, targeting closest player: ${targetPlayer.username}`);
                    }
                }
                if (targetPlayer) {
                    // Set following state to go to the target player
                    isFollowingPlayer = true;
                    targetPlayerPosition = targetPlayer.entity.position.clone();
                    followingPlayerName = targetPlayer.username;
                    originalPosition = bot.entity.position.clone();
                    // Respond with exact greeting format
                    const isExactBotGreeting = message.toLowerCase().includes('hi afkbot123') ||
                        message.toLowerCase().includes('hello afkbot123') ||
                        message.toLowerCase().includes('hey afkbot123');
                    const responses = isExactBotGreeting ?
                        [`hi`] : // Simple "hi" response for "hi AFKbot123"
                        [
                            `Hi ${username}!`,
                            `Hello ${username}!`,
                            `Hey ${username}!`,
                            `Hi ${username}! Coming to you!`
                        ];
                    const randomResponse = responses[Math.floor(Math.random() * responses.length)];
                    bot.chat(randomResponse);
                }
                else {
                    // No players found at all
                    bot.chat(`Hi ${username}! I hear you but can't see anyone nearby!`);
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
                const targetPlayer = Object.values(bot.players).find(player => player.username &&
                    player.username.toLowerCase() === targetPlayerName.toLowerCase() &&
                    player.entity &&
                    player.username !== bot.username);
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
                    }
                    else {
                        bot.chat(`Hi ${targetPlayer.username}! Coming to you! 👋`);
                    }
                }
                else {
                    // Fallback to closest player if target not found
                    const closestPlayer = getClosestPlayer(30);
                    if (closestPlayer) {
                        console.log(`❓ Player '${targetPlayerName}' not found, targeting closest player: ${closestPlayer.username}`);
                        // Set following state for closest player
                        isFollowingPlayer = true;
                        targetPlayerPosition = closestPlayer.entity.position.clone();
                        followingPlayerName = closestPlayer.username;
                        originalPosition = bot.entity.position.clone();
                        bot.chat(`Hi ${closestPlayer.username}! (${targetPlayerName} not found, but coming to you!)`);
                    }
                    else {
                        console.log(`❓ Player '${targetPlayerName}' not found and no players nearby`);
                        bot.chat(`Hi! I want to find ${targetPlayerName} but they're not around and I don't see anyone nearby!`);
                    }
                }
            }
        });
        // Alternative chat listener for modern servers (fallback)
        bot.on('message', (jsonMsg) => {
            try {
                const msgText = jsonMsg.toString();
                console.log(`📄 RAW MESSAGE: ${msgText}`);
                // REMOVED: Simple response fallback that bypassed username verification
                // Now only accept responses from properly parsed messages with verified usernames
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
                            bot.chat(`me too i loved this server very much`);
                            waitingForServerResponse = false;
                            isStandingStill = false;
                            serverQuestionAsker = '';
                            if (responseTimeout)
                                clearTimeout(responseTimeout);
                        }
                        else if (response.includes('no') || response === 'n' || response.includes('hate') || response.includes('bad') || response.includes('nah')) {
                            console.log(`😡 ${username} doesn't love the server! (via fallback)`);
                            bot.chat(`GET OUT YOU DONT BELONG TO THIS SERVER IF YOU DONT LOVE IT I HATE U`);
                            waitingForServerResponse = false;
                            isStandingStill = false;
                            serverQuestionAsker = '';
                            if (responseTimeout)
                                clearTimeout(responseTimeout);
                        }
                    }
                }
            }
            catch (error) {
                // Ignore parsing errors
            }
        });
        // Helper function to get the closest player within range
        const getClosestPlayer = (range = 30, requireEntity = true, excludeSelf = true) => {
            const players = Object.values(bot.players).filter(player => player.entity &&
                (excludeSelf ? player.username !== bot.username : true) &&
                player.entity.position.distanceTo(bot.entity.position) <= range);
            if (players.length === 0)
                return null;
            // Sort by distance and return the closest
            players.sort((a, b) => {
                const distA = a.entity.position.distanceTo(bot.entity.position);
                const distB = b.entity.position.distanceTo(bot.entity.position);
                return distA - distB;
            });
            return players[0];
        };
        // Legacy function for compatibility - now uses closest player
        const findNearbyPlayer = () => getClosestPlayer(60);
        // Smooth turning system to prevent jerky movement
        let lastYaw = 0;
        let lastPitch = 0;
        let targetLockUntil = 0;
        // Anti-loop detection for pathfinding
        let lastDirection = '';
        let sameDirectionCount = 0;
        let stuckCounter = 0;
        let lastPosition = null;
        let positionHistory = [];
        const smoothLookTo = (targetPos, maxYawStep = 0.2, maxPitchStep = 0.15, deadZone = 0.05) => {
            if (!bot.entity || !targetPos)
                return false;
            const dx = targetPos.x - bot.entity.position.x;
            const dy = targetPos.y - bot.entity.position.y;
            const dz = targetPos.z - bot.entity.position.z;
            // Calculate target yaw and pitch
            const targetYaw = Math.atan2(-dx, -dz);
            const distance = Math.sqrt(dx * dx + dz * dz);
            const targetPitch = Math.atan2(-dy, distance);
            // Calculate yaw difference (handle wrapping)
            let yawDiff = targetYaw - bot.entity.yaw;
            while (yawDiff > Math.PI)
                yawDiff -= 2 * Math.PI;
            while (yawDiff < -Math.PI)
                yawDiff += 2 * Math.PI;
            // Calculate pitch difference
            let pitchDiff = targetPitch - bot.entity.pitch;
            // Only adjust if outside dead zone
            if (Math.abs(yawDiff) > deadZone || Math.abs(pitchDiff) > deadZone) {
                // Limit rotation speed
                const yawStep = Math.sign(yawDiff) * Math.min(Math.abs(yawDiff), maxYawStep);
                const pitchStep = Math.sign(pitchDiff) * Math.min(Math.abs(pitchDiff), maxPitchStep);
                const newYaw = bot.entity.yaw + yawStep;
                const newPitch = bot.entity.pitch + pitchStep;
                bot.look(newYaw, newPitch);
                // Return true if we're still turning (outside of smaller precision zone)
                return Math.abs(yawDiff) > 0.1 || Math.abs(pitchDiff) > 0.1;
            }
            return false; // Not turning
        };
        // Enhanced block scanning system for natural player navigation
        const scanNearbyBlocks = () => {
            const position = bot.entity.position;
            const yaw = bot.entity.yaw;
            const scanRange = 5; // Scan 5 blocks ahead in each direction
            const results = {
                forward: { safe: true, distance: scanRange, hasCliff: false, hasWater: false, hasLava: false, canJump: false },
                left: { safe: true, distance: scanRange, hasCliff: false, hasWater: false, hasLava: false, canJump: false },
                right: { safe: true, distance: scanRange, hasCliff: false, hasWater: false, hasLava: false, canJump: false },
                back: { safe: true, distance: scanRange, hasCliff: false, hasWater: false, hasLava: false, canJump: false }
            };
            // Direction vectors based on bot's current yaw
            const directions = {
                forward: { x: -Math.sin(yaw), z: -Math.cos(yaw) },
                left: { x: -Math.cos(yaw), z: Math.sin(yaw) },
                right: { x: Math.cos(yaw), z: -Math.sin(yaw) },
                back: { x: Math.sin(yaw), z: Math.cos(yaw) }
            };
            // Scan each direction
            Object.entries(directions).forEach(([dirName, dir]) => {
                for (let i = 1; i <= scanRange; i++) {
                    const checkX = position.x + (dir.x * i);
                    const checkZ = position.z + (dir.z * i);
                    const checkY = Math.floor(position.y);
                    // Check blocks at foot level, head level, and ground level
                    const blockPosFeet = new Vec3(Math.floor(checkX), checkY, Math.floor(checkZ));
                    const blockPosHead = new Vec3(Math.floor(checkX), checkY + 1, Math.floor(checkZ));
                    const blockPosGround = new Vec3(Math.floor(checkX), checkY - 1, Math.floor(checkZ));
                    const blockPosFarGround = new Vec3(Math.floor(checkX), checkY - 2, Math.floor(checkZ));
                    const blockFeet = bot.blockAt(blockPosFeet);
                    const blockHead = bot.blockAt(blockPosHead);
                    const blockGround = bot.blockAt(blockPosGround);
                    const blockFarGround = bot.blockAt(blockPosFarGround);
                    // Check for solid walls (blocks at feet or head level)
                    const feetSolid = blockFeet && blockFeet.boundingBox === 'block';
                    const headSolid = blockHead && blockHead.boundingBox === 'block';
                    // Special case: If only feet is blocked but head is clear, it might be jumpable
                    if (feetSolid && !headSolid) {
                        results[dirName].canJump = true;
                        // Don't mark as unsafe yet, player can jump over 1-block obstacles
                        if (i === 1)
                            continue; // Allow jumping over first block
                    }
                    // Wall detected if both levels blocked or head blocked
                    if ((feetSolid && headSolid) || headSolid) {
                        results[dirName].safe = false;
                        results[dirName].distance = i - 1;
                        break;
                    }
                    // Check for cliffs (no ground for 2+ blocks down)
                    const groundSolid = blockGround && blockGround.boundingBox === 'block';
                    const farGroundSolid = blockFarGround && blockFarGround.boundingBox === 'block';
                    if (!groundSolid && !farGroundSolid) {
                        results[dirName].hasCliff = true;
                        results[dirName].safe = false;
                        results[dirName].distance = i - 1;
                        break;
                    }
                    // Check for dangerous liquids
                    if (blockFeet) {
                        if (blockFeet.name.includes('lava') || blockFeet.name === 'lava') {
                            results[dirName].hasLava = true;
                            results[dirName].safe = false;
                            results[dirName].distance = i - 1;
                            break;
                        }
                        if (blockFeet.name === 'water' || blockFeet.name === 'flowing_water') {
                            results[dirName].hasWater = true;
                            // Water is not immediately unsafe, just note it
                        }
                    }
                }
            });
            return results;
        };
        // Find the best direction to move based on scanned blocks (like a smart player would)
        const findBestDirection = (scanResults) => {
            const directions = ['forward', 'left', 'right', 'back'];
            let bestDirection = 'forward';
            let bestScore = -999;
            console.log('🔍 Analyzing path options...');
            directions.forEach(dir => {
                const result = scanResults[dir];
                let score = 0;
                let description = '';
                // Base score on safe distance (further is better)
                score += result.distance * 15;
                description += `distance:${result.distance}`;
                // Big bonus for being completely safe
                if (result.safe) {
                    score += 100;
                    description += ' safe';
                }
                else {
                    description += ' blocked';
                }
                // Handle specific hazards
                if (result.hasCliff) {
                    score -= 80;
                    description += ' cliff!';
                }
                if (result.hasLava) {
                    score -= 200;
                    description += ' lava!';
                }
                if (result.hasWater) {
                    score -= 20;
                    description += ' water';
                }
                if (result.canJump) {
                    score += 30; // Bonus for jumpable obstacles
                    description += ' jumpable';
                }
                // Natural player preferences
                if (dir === 'forward') {
                    score += 40; // Strong preference for going forward
                    description += ' (preferred)';
                }
                if (dir === 'left' || dir === 'right') {
                    score += 20; // Moderate preference for sides over backward
                }
                console.log(`  ${dir}: ${description} (score: ${score})`);
                if (score > bestScore) {
                    bestScore = score;
                    bestDirection = dir;
                }
            });
            console.log(`🎯 Best direction: ${bestDirection} (score: ${bestScore})`);
            return { direction: bestDirection, score: bestScore, scanResults };
        };
        // Legacy function for compatibility - now uses enhanced scanning
        const isWallInDirection = (relativeDirection) => {
            const scanResults = scanNearbyBlocks();
            const result = scanResults[relativeDirection];
            return !result || !result.safe;
        };
        const smartAvoidWall = async () => {
            console.log('🧱 Obstacle detected! Using intelligent pathfinding...');
            // Scan all directions to find the best path
            const scanResults = scanNearbyBlocks();
            const bestPath = findBestDirection(scanResults);
            // Anti-loop detection: if we keep choosing the same direction, try something else
            if (bestPath.direction === lastDirection) {
                sameDirectionCount++;
            }
            else {
                sameDirectionCount = 0;
                lastDirection = bestPath.direction;
            }
            // If stuck in same direction for too long, force a different approach
            if (sameDirectionCount > 3) {
                console.log(`🚨 Breaking loop! Tried ${bestPath.direction} ${sameDirectionCount} times. Forcing back direction.`);
                bestPath.direction = 'back';
                bestPath.score = 200; // Override score
                sameDirectionCount = 0;
            }
            // If we found a good direction, turn towards it smoothly
            if (bestPath.direction !== 'forward') {
                let angleChange = 0;
                switch (bestPath.direction) {
                    case 'left':
                        angleChange = -Math.PI / 2; // Turn left 90 degrees
                        break;
                    case 'right':
                        angleChange = Math.PI / 2; // Turn right 90 degrees
                        break;
                    case 'back':
                        angleChange = Math.PI; // Turn around 180 degrees
                        break;
                }
                console.log(`🎯 Turning ${bestPath.direction} (score: ${bestPath.score})`);
                // Calculate target position for smooth turning
                const targetYaw = bot.entity.yaw + angleChange;
                const pathTarget = {
                    x: bot.entity.position.x + Math.sin(-targetYaw) * 10,
                    y: bot.entity.position.y,
                    z: bot.entity.position.z + Math.cos(-targetYaw) * 10
                };
                // Use smooth turning with moderate speed for pathfinding
                smoothLookTo(pathTarget, 0.25, 0.15, 0.05);
                // If the best path involves jumping over obstacles, prepare to jump (only when sprinting)
                if (bestPath.scanResults[bestPath.direction].canJump && bot.getControlState('sprint')) {
                    console.log('🦘 Preparing to jump over obstacle while sprinting...');
                    await sleep(200); // Brief pause before jumping
                    bot.setControlState('jump', true);
                    await sleep(300);
                    bot.setControlState('jump', false);
                }
                else if (bestPath.scanResults[bestPath.direction].canJump) {
                    console.log('🚶 Obstacle detected but not sprinting - walking around instead...');
                }
            }
            return; // Exit and let normal movement continue
        };
        // Legacy function for backward compatibility
        const avoidWall = async () => {
            await smartAvoidWall();
        };
        // Movement lock to prevent overlapping movements
        let isMoving = false;
        const moveTowardsPlayer = async (targetPos) => {
            const botPos = bot.entity.position;
            const dx = targetPos.x - botPos.x;
            const dz = targetPos.z - botPos.z;
            // Look towards target smoothly
            const lookTarget = {
                x: targetPlayerPosition.x,
                y: targetPlayerPosition.y,
                z: targetPlayerPosition.z
            };
            const isStillTurning = smoothLookTo(lookTarget, 0.3, 0.2, 0.08);
            // If we're still turning significantly, don't start moving yet
            if (isStillTurning) {
                console.log('🔄 Still turning towards player, waiting to finish turn...');
                return;
            }
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
            const halfChance = Math.random() < 0.5;
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
                }
                catch (error) {
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
            }
            else if (distance > 100) {
                console.log(`🚫 Target too far away (${distance.toFixed(2)} blocks)! Giving up chase...`);
                bot.chat(`Sorry ${followingPlayerName}, you're too far away! 😅`);
                isFollowingPlayer = false;
                targetPlayerPosition = null;
                followingPlayerName = '';
                lastPlayerDetected = ''; // Reset so we can detect them again later
            }
        };
        const changePos = async () => {
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
                        }
                        else {
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
                    const currentTarget = Object.values(bot.players).find(player => player.username === followingPlayerName &&
                        player.entity);
                    if (currentTarget) {
                        // Update to current position for better tracking
                        targetPlayerPosition = currentTarget.entity.position.clone();
                        await moveTowardsPlayer(targetPlayerPosition);
                    }
                    else {
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
                    switch (newDirection) {
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
                        const targetYaw = currentYaw + angleChange;
                        const directionTarget = {
                            x: bot.entity.position.x + Math.sin(-targetYaw) * 10,
                            y: bot.entity.position.y,
                            z: bot.entity.position.z + Math.cos(-targetYaw) * 10
                        };
                        // Use smooth turning instead of instant snap
                        smoothLookTo(directionTarget, 0.15, 0.1, 0.03);
                    }
                    // Reset movement counter with random distance (30-80 moves - much longer!)
                    targetDistance = 30 + Math.floor(Math.random() * 50);
                    moveCount = 0;
                    console.log(`🎲 Will move ${targetDistance} steps in this direction`);
                }
                // Much lower chance for random actions to reduce anti-cheat triggers (2% chance)
                if (Math.random() < 0.02) {
                    const actions = ['pause', 'look_around']; // Removed jump and spin to be less suspicious
                    const action = getRandom(actions);
                    switch (action) {
                        case 'pause':
                            console.log('⏸️ Taking a random pause...');
                            await sleep(1000 + Math.random() * 2000); // Pause 1-3 seconds
                            return;
                        case 'look_around':
                            console.log('👀 Looking around naturally...');
                            const currentYaw = bot.entity.yaw;
                            const smallTurn = (Math.random() - 0.5) * 0.5; // Small 15 degree turn
                            const targetYaw = currentYaw + smallTurn;
                            const lookTarget = {
                                x: bot.entity.position.x + Math.sin(-targetYaw) * 10,
                                y: bot.entity.position.y + (Math.random() - 0.5) * 3, // Look up/down slightly
                                z: bot.entity.position.z + Math.cos(-targetYaw) * 10
                            };
                            // Very gentle, natural looking
                            smoothLookTo(lookTarget, 0.08, 0.06, 0.02);
                            await sleep(1000 + Math.random() * 2000); // Brief pause to look
                            break;
                    }
                }
                // Anti-stuck detection: check if bot hasn't moved significantly
                const currentPos = bot.entity.position;
                if (lastPosition) {
                    const distanceMoved = currentPos.distanceTo(lastPosition);
                    if (distanceMoved < 0.5) { // Barely moved
                        stuckCounter++;
                        console.log(`⚠️ Bot seems stuck! Distance moved: ${distanceMoved.toFixed(2)}, stuck counter: ${stuckCounter}`);
                        if (stuckCounter > 10) {
                            console.log('🚨 Bot is definitely stuck! Attempting emergency escape...');
                            // Emergency escape: jump and move back
                            bot.setControlState('jump', true);
                            await sleep(300);
                            bot.setControlState('jump', false);
                            // Turn around completely
                            const escapeYaw = bot.entity.yaw + Math.PI;
                            const escapeTarget = {
                                x: bot.entity.position.x + Math.sin(-escapeYaw) * 15,
                                y: bot.entity.position.y,
                                z: bot.entity.position.z + Math.cos(-escapeYaw) * 15
                            };
                            smoothLookTo(escapeTarget, 0.4, 0.3, 0.1);
                            // Reset counters
                            stuckCounter = 0;
                            sameDirectionCount = 0;
                            lastDirection = '';
                            return;
                        }
                    }
                    else {
                        stuckCounter = Math.max(0, stuckCounter - 1); // Reduce if moving
                    }
                }
                lastPosition = currentPos.clone();
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
                if (!currentSprintState || moveCount % 12 === 0) { // Change sprint state every 12 steps for less suspicious behavior
                    currentSprintState = Math.random() < 0.04; // Reduced to 4% chance to sprint
                    console.log(`🚶 Moving${currentSprintState ? " (sprinting batch)" : " (walking batch)"} (Step ${moveCount})`);
                    bot.setControlState('sprint', currentSprintState);
                }
                else {
                    console.log(`🚶 Moving${currentSprintState ? " (sprinting)" : ""} (Step ${moveCount})`);
                }
                // Only jump when sprinting AND there's an obstacle that requires jumping
                const timeSinceLastJump = Date.now() - (lastJumpTime || 0);
                const blockAhead = bot.blockAt(bot.entity.position.offset(0, 0, -1)); // Block in front
                const needsJump = blockAhead && blockAhead.boundingBox === 'block' && blockAhead.position.y >= bot.entity.position.y;
                if (currentSprintState && needsJump && timeSinceLastJump > 3000) { // Only when sprinting, obstacle ahead, 3s cooldown
                    bot.setControlState('jump', true);
                    lastJumpTime = Date.now();
                    console.log('🦘 Jumping over obstacle while sprinting!');
                }
                // Set forward movement
                bot.setControlState('forward', true);
                // Very rare head movements to avoid anti-cheat
                if (Math.random() < 0.01) { // Only 1% chance for very natural feel
                    const currentYaw = bot.entity.yaw;
                    // Tiny, realistic head adjustments
                    const yawAdjustment = (Math.random() - 0.5) * 0.15; // Reduced for smoother feel
                    const targetYaw = currentYaw + yawAdjustment;
                    const headTarget = {
                        x: bot.entity.position.x + Math.sin(-targetYaw) * 10,
                        y: bot.entity.position.y + (Math.random() - 0.5) * 2, // Small vertical look
                        z: bot.entity.position.z + Math.cos(-targetYaw) * 10
                    };
                    // Very gentle smooth head movement
                    smoothLookTo(headTarget, 0.05, 0.03, 0.02);
                }
                // Much longer movement duration to reduce packet spam
                const moveDuration = 600 + Math.random() * 400; // 600-1000ms per step
                await sleep(moveDuration);
                bot.clearControlStates();
            }
            finally {
                isMoving = false;
            }
            return;
        };
        const changeView = async () => {
            // Don't interfere with movement or wall avoidance
            if (isMoving)
                return;
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
                switch (action) {
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
            if (lookAroundInterval)
                clearInterval(lookAroundInterval);
            if (chatInterval)
                clearInterval(chatInterval);
            if (loop)
                clearInterval(loop);
        });
    });
    bot.once('login', () => {
        console.log(`AFKBot logged in ${bot.username}\n\n`);
    });
};
export default () => {
    createBot();
};
