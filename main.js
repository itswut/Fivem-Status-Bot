const { Client, GatewayIntentBits, Partials, AttachmentBuilder } = require("discord.js");
const config = require("./config.json");
const fs = require("fs");
const cfx = require("cfx-api");
const puppeteer = require("puppeteer");
const botClient = new Client({ intents: Object.values(GatewayIntentBits), partials: [Partials.Channel] });

botClient.once("ready", () => {
    setInterval(() => {
        checkCfxStatus();
        checkServerStatus();
    }, 10000); // Check every 5 minutes
});

let lastServerStatus, currentServerStatus, Time = 0;

function convertToHoursAndMinutes(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return { hours, minutes };
}

async function checkServerStatus() {
    Time += 5;
    let embed = {};
    const { hours, minutes } = convertToHoursAndMinutes(Time);
    try {
        const serverStatus = await cfx.fetchServer(config.srvStatus.SERVER_ID);
        embed = createEmbedForServerStatus(serverStatus, hours, minutes);
        currentServerStatus = "online";
    } catch (error) {
        embed = createEmbedForServerOffline(hours, minutes);
        currentServerStatus = "offline";
    }

    if (currentServerStatus !== lastServerStatus) {
        Time = 0;
    }

    const channel = await botClient.channels.fetch(config.srvStatus.CHANNEL_ID);
    const emote = currentServerStatus === "online" ? "🟢" : "🔴";
    if (!channel) return;
    channel.setName(`${emote} ${config.srvStatus.CHANNEL_NAME}`); // Change the channel name to green if the server is online

    let message;
    try {
        const lastMessageId = config.srvStatus.lastMessageId;
        if (lastMessageId) {
            message = await channel.messages.fetch(lastMessageId);
            await message.edit({ embeds: [embed] });
        } else {
            message = await channel.send({ embeds: [embed] });
            config.srvStatus.lastMessageId = message.id;
            fs.writeFileSync("./config.json", JSON.stringify(config, null, 4));
        }
    } catch (error) {
        message = await channel.send({ embeds: [embed] });
        config.srvStatus.lastMessageId = message.id;
        fs.writeFileSync("./config.json", JSON.stringify(config, null, 4));
    }
    lastServerStatus = currentServerStatus;
}

function createEmbedForServerStatus(statusData, hours, minutes) {
    return {
        title: "Server Status",
        description: "🟢 The server is currently online and operational.",
        fields: [
            { name: "Players", value: `${statusData.data.clients} / ${statusData.data.sv_maxclients}` },
            { name: "Connect", value: `[Here](https://cfx.re/join/${config.srvStatus.SERVER_ID})` },
            { name: "Uptime", value: `${hours} hours and ${minutes} minutes` }
        ],
        color: 6205745,
        timestamp: new Date()
    };
}

function createEmbedForServerOffline(hours, minutes) {
    return {
        title: "Server Status",
        description: "🔴 The server is currently offline, we are working on getting it back online.",
        fields: [{ name: "Downtime", value: `${hours} hours and ${minutes} minutes` }],
        color: 16711680,
        timestamp: new Date()
    };
}

async function takeScreenshot() {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    await page.goto("https://status.cfx.re/");
    await page.setViewport({ width: 1000, height: 800 });
    await page.evaluate(async () => {
        const gameServicesIcon = document.querySelector(".component-inner-container.status-green.showcased .group-parent-indicator");
        gameServicesIcon.click();

        await new Promise(resolve => {
            setTimeout(resolve, 1000);
        });
    });
    await page.screenshot({ path: "screenshot.png" });
    await browser.close();
}

async function checkCfxStatus() {
    const status = await cfx.fetchStatus();
    const statusText = status.everythingOk ? "All Cfx.re systems are operational" : "Cfx.re is experiencing issues";
    const statusDesc = status.everythingOk ? "All Systems Operational" : "Experiencing Issues";
    const statusColor = status.everythingOk ? 6205745 : 16711680;
    const statusEmoji = status.everythingOk ? "🟢" : "🔴";

    await takeScreenshot();

    const components = await status.fetchComponents();
    const componentLines = components.map(component => {
        const componentStatus = component.status.toLowerCase() === "operational" ? "🟢" : "🔴";
        return `${componentStatus} **${component.name}**: ${component.status}`;
    });

    const attachment = new AttachmentBuilder('./screenshot.png');

    const embed = {
        title: "Cfx.re Status",
        description: `${statusEmoji} **API Status**: ${statusDesc}`,
        fields: [{ name: "Component Status", value: componentLines.join("\n") }],
        timestamp: new Date(),
        color: statusColor,
        image: { url: 'attachment://screenshot.png' },
        footer: { text: `Last updated at: ${new Date().toLocaleString()}` }
    };

    const channel = await botClient.channels.fetch(config.cfxStatus.CHANNEL_ID);
    if (!channel) return;
    channel.setName(`${statusEmoji} ${config.cfxStatus.CHANNEL_NAME}`);

    let message;
    try {
        const lastMessageId = config.cfxStatus.lastMessageId;
        if (lastMessageId) {
            message = await channel.messages.fetch(lastMessageId);
            await message.edit({ content: statusText, embeds: [embed], files: [attachment] });
        } else {
            message = await channel.send({ content: statusText, embeds: [embed], files: [attachment] });
            config.cfxStatus.lastMessageId = message.id;
            fs.writeFileSync("./config.json", JSON.stringify(config, null, 4));
        }
    } catch (error) {
        message = await channel.send({ content: statusText, embeds: [embed], files: [attachment] });
        config.cfxStatus.lastMessageId = message.id;
        fs.writeFileSync("./config.json", JSON.stringify(config, null, 4));
    }
}

botClient.login(config.BOT_TOKEN);