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
        bot = Mineflayer.createBot({
                host: CONFIG.client.host,
                port: +CONFIG.client.port,
                username: CONFIG.client.username,
                version: '1.20.4' // Specify Minecraft version
        } as const);


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
                let currentDirection: Mineflayer.ControlState = 'forward';
                let isGoingBack = false;
                let isFollowingPlayer = false;
                let targetPlayerPosition: any = null;
                let followingPlayerName = '';
                let originalPosition: any = null;
                let lastPlayerCheckTime = 0;
                let lastPlayerDetected = '';
                
                // Chat message every 5 minutes
                const chatInterval = setInterval(() => {
                        console.log('Sending love message...');
                        bot.chat('wow I love this server');
                }, 5 * 60 * 1000); // 5 minutes
                
                // Listen for chat messages to detect "hi [playername]" commands
                bot.on('chat', (username, message) => {
                        // Don't react to our own messages
                        if (username === bot.username) return;
                        
                        console.log(`💬 ${username}: ${message}`);
                        
                        // Check if message contains "hi" followed by a player name
                        const hiMatch = message.toLowerCase().match(/^hi\s+(\w+)$/i);
                        if (hiMatch) {
                                const targetPlayerName = hiMatch[1];
                                
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
                                        
                                        // Respond in chat
                                        bot.chat(`Hi ${targetPlayer.username}! Coming to you! 👋`);
                                } else {
                                        console.log(`❓ Player '${targetPlayerName}' not found or not online`);
                                }
                        }
                });
                
                const findNearbyPlayer = () => {
                        const players = Object.values(bot.players).filter(player => 
                                player.entity && 
                                player.username !== bot.username &&
                                player.entity.position.distanceTo(bot.entity.position) <= 30 // Within 30 blocks
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
                        
                        // Wall if either foot or head level has a solid block (not null/undefined)
                        const feetSolid = blockFeet && blockFeet.boundingBox === 'block';
                        const headSolid = blockHead && blockHead.boundingBox === 'block';
                        
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
                                bot.chat(`Hello ${followingPlayerName}! 😊`);
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
                        // Prevent overlapping movements
                        if (isMoving) {
                                return;
                        }
                        isMoving = true;
                        
                        try {
                        // 1% chance to spot and follow a player (only when not already following) with 15-second cooldown
                        const now = Date.now();
                        if (!isFollowingPlayer && Math.random() < 0.01 && (now - lastPlayerCheckTime) > 15000) {
                                lastPlayerCheckTime = now;
                                const nearbyPlayer = findNearbyPlayer();
                                if (nearbyPlayer && nearbyPlayer.username !== lastPlayerDetected) {
                                        isFollowingPlayer = true;
                                        targetPlayerPosition = nearbyPlayer.entity.position.clone();
                                        followingPlayerName = nearbyPlayer.username;
                                        originalPosition = bot.entity.position.clone();
                                        lastPlayerDetected = nearbyPlayer.username;
                                        
                                        console.log(`👀 Spotted player ${followingPlayerName}! Following them...`);
                                        bot.chat(`${followingPlayerName}!`);
                                        
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
                        
                        // Normal movement behavior
                        moveCount++;
                        
                        // After 20 moves, turn around and go back
                        if (moveCount === 20 && !isGoingBack) {
                                console.log('20 moves completed! Turning around...');
                                
                                // Turn around 180 degrees but keep using 'forward' control
                                const currentYaw = bot.entity.yaw;
                                const backYaw = currentYaw + Math.PI; // Turn 180 degrees
                                await bot.look(backYaw, 0, true);
                                
                                // Switch to going back
                                isGoingBack = true;
                                // Keep currentDirection = 'forward' since we turned around
                                moveCount = 0; // Reset counter for next cycle
                        } else if (moveCount === 20 && isGoingBack) {
                                console.log('20 back moves completed! Turning around again...');
                                
                                // Turn forward again
                                const currentYaw = bot.entity.yaw;
                                const forwardYaw = currentYaw + Math.PI; // Turn 180 degrees back
                                await bot.look(forwardYaw, 0, true);
                                
                                // Switch to going forward
                                isGoingBack = false;
                                // Keep currentDirection = 'forward' since we turned around
                                moveCount = 0; // Reset counter for next cycle
                        }
                        
                        // Check for wall collision in normal movement (always check forward since we turn around)
                        if (isWallInDirection('forward')) {
                                await avoidWall();
                                return; // Skip this movement cycle to allow the new direction to take effect
                        }
                        
                        const halfChance: boolean = Math.random() < 0.5;
                        console.debug(`forward${halfChance ? " with sprinting" : ''} (Move ${moveCount}/20)`);

                        bot.setControlState('sprint', halfChance);
                        bot.setControlState('forward', true); // Always use forward since we handle direction by turning

                        await sleep(CONFIG.action.holdDuration);
                        bot.clearControlStates();
                        } finally {
                                isMoving = false;
                        }
                        return;
                };
                
                const changeView = async (): Promise<void> => {
                        // Don't interfere with movement or wall avoidance
                        if (isMoving) return;
                        
                        // 40% chance to look around each move (more human-like)
                        if (Math.random() < 0.4) {
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
                        clearInterval(lookAroundInterval);
                        clearInterval(chatInterval);
                });
        });
        bot.once('login', () => {
                console.log(`AFKBot logged in ${bot.username}\n\n`);
        });
};



export default (): void => {
        createBot();
};