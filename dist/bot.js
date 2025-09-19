import Mineflayer from 'mineflayer';
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
    bot = Mineflayer.createBot({
        host: CONFIG.client.host,
        port: +CONFIG.client.port,
        username: CONFIG.client.username,
        version: '1.20.4' // Specify Minecraft version
    });
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
        let currentDirection = 'forward';
        let isGoingBack = false;
        let isFollowingPlayer = false;
        let targetPlayerPosition = null;
        let followingPlayerName = '';
        let originalPosition = null;
        // Chat message every 5 minutes
        const chatInterval = setInterval(() => {
            console.log('Sending love message...');
            bot.chat('wow I love this server');
        }, 5 * 60 * 1000); // 5 minutes
        const findNearbyPlayer = () => {
            const players = Object.values(bot.players).filter(player => player.entity &&
                player.username !== bot.username &&
                player.entity.position.distanceTo(bot.entity.position) <= 30 // Within 30 blocks
            );
            return players.length > 0 ? players[Math.floor(Math.random() * players.length)] : null;
        };
        const isWallInDirection = (direction) => {
            const currentPos = bot.entity.position;
            let checkPos;
            switch (direction) {
                case 'forward':
                    checkPos = currentPos.offset(0, 0, 1);
                    break;
                case 'back':
                    checkPos = currentPos.offset(0, 0, -1);
                    break;
                case 'left':
                    checkPos = currentPos.offset(-1, 0, 0);
                    break;
                case 'right':
                    checkPos = currentPos.offset(1, 0, 0);
                    break;
                default:
                    return false;
            }
            const block = bot.blockAt(checkPos);
            return block ? block.type !== 0 : false; // 0 = air block, null = no block data
        };
        const moveTowardsPlayer = async (targetPos) => {
            const botPos = bot.entity.position;
            const dx = targetPos.x - botPos.x;
            const dz = targetPos.z - botPos.z;
            // Determine primary movement direction
            let moveDirection;
            if (Math.abs(dx) > Math.abs(dz)) {
                moveDirection = dx > 0 ? 'right' : 'left';
            }
            else {
                moveDirection = dz > 0 ? 'forward' : 'back';
            }
            // Check for wall collision
            if (isWallInDirection(moveDirection)) {
                console.log('🧱 Hit a wall! Stopping player following...');
                isFollowingPlayer = false;
                targetPlayerPosition = null;
                followingPlayerName = '';
                return;
            }
            // Look towards target
            const yaw = Math.atan2(-dx, -dz);
            await bot.look(yaw, 0, true);
            // Move towards target
            const halfChance = Math.random() < 0.5;
            console.log(`🏃‍♂️ Following ${followingPlayerName}! Moving ${moveDirection}${halfChance ? " with sprinting" : ''}`);
            bot.setControlState('sprint', halfChance);
            bot.setControlState(moveDirection, true);
            await sleep(CONFIG.action.holdDuration);
            bot.clearControlStates();
            // Check if reached target position or stuck
            const distance = botPos.distanceTo(targetPos);
            console.log(`📏 Distance to ${followingPlayerName}: ${distance.toFixed(2)} blocks`);
            if (distance < 2) {
                console.log(`✅ Reached ${followingPlayerName}'s last position! Returning to normal behavior...`);
                isFollowingPlayer = false;
                targetPlayerPosition = null;
                followingPlayerName = '';
            }
            else if (distance > 50) {
                console.log(`🚫 Target too far away (${distance.toFixed(2)} blocks)! Giving up chase...`);
                isFollowingPlayer = false;
                targetPlayerPosition = null;
                followingPlayerName = '';
            }
        };
        const changePos = async () => {
            // 5% chance to spot and follow a player (only when not already following)
            if (!isFollowingPlayer && Math.random() < 0.05) {
                console.log('🔍 Checking for nearby players...');
                const allPlayers = Object.keys(bot.players);
                console.log(`📊 Total players on server: ${allPlayers.length} (${allPlayers.join(', ')})`);
                const nearbyPlayer = findNearbyPlayer();
                if (nearbyPlayer) {
                    isFollowingPlayer = true;
                    targetPlayerPosition = nearbyPlayer.entity.position.clone();
                    followingPlayerName = nearbyPlayer.username;
                    originalPosition = bot.entity.position.clone();
                    console.log(`👀 Spotted player ${followingPlayerName}! Following them...`);
                    bot.chat(`${followingPlayerName}!`);
                    // Look at the player
                    await bot.lookAt(nearbyPlayer.entity.position.offset(0, nearbyPlayer.entity.height, 0));
                    await moveTowardsPlayer(targetPlayerPosition);
                    return;
                }
            }
            // If currently following a player, continue following
            if (isFollowingPlayer && targetPlayerPosition) {
                await moveTowardsPlayer(targetPlayerPosition);
                return;
            }
            // Normal movement behavior
            moveCount++;
            // After 20 moves, look back and go back
            if (moveCount === 20 && !isGoingBack) {
                console.log('20 moves completed! Looking back and going back...');
                // Look back (turn around 180 degrees)
                const currentYaw = bot.entity.yaw;
                const backYaw = currentYaw + Math.PI; // Turn 180 degrees
                await bot.look(backYaw, 0, true);
                // Switch to going back
                isGoingBack = true;
                currentDirection = 'back';
                moveCount = 0; // Reset counter for next cycle
            }
            else if (moveCount === 20 && isGoingBack) {
                console.log('20 back moves completed! Looking forward and going forward...');
                // Look forward again
                const currentYaw = bot.entity.yaw;
                const forwardYaw = currentYaw + Math.PI; // Turn 180 degrees back
                await bot.look(forwardYaw, 0, true);
                // Switch to going forward
                isGoingBack = false;
                currentDirection = 'forward';
                moveCount = 0; // Reset counter for next cycle
            }
            const halfChance = Math.random() < 0.5;
            console.debug(`${currentDirection}${halfChance ? " with sprinting" : ''} (Move ${moveCount}/20)`);
            bot.setControlState('sprint', halfChance);
            bot.setControlState(currentDirection, true);
            await sleep(CONFIG.action.holdDuration);
            bot.clearControlStates();
            return;
        };
        const changeView = async () => {
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
            clearInterval(lookAroundInterval);
            clearInterval(chatInterval);
        });
    });
    bot.once('login', () => {
        console.log(`AFKBot logged in ${bot.username}\n\n`);
    });
};
export default () => {
    createBot();
};
