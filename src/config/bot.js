const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    Events,
    SlashCommandBuilder,
    REST,
    Routes
} = require("discord.js");

const Database = require("better-sqlite3");

// ================= CONFIG =================

const TOKEN = "PASTE_TOKEN";
const GUILD_ID = "1519398843987525825";
const ACADEMS_ROLE_ID = "1519404974008963113";

// ================= CLIENT =================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

// ================= DATABASE =================

const db = new Database("database.db");

db.prepare(`
CREATE TABLE IF NOT EXISTS academs (
    userId TEXT PRIMARY KEY,
    nickname TEXT,
    joinDate TEXT,
    hours INTEGER DEFAULT 0,
    warnings INTEGER DEFAULT 0,
    violations INTEGER DEFAULT 0,
    note TEXT DEFAULT '',
    status TEXT DEFAULT 'Academs'
)
`).run();

// ================= HELPERS =================

function today() {
    return new Date().toLocaleDateString("ru-RU");
}

function createUser(member) {
    const exists = db.prepare("SELECT userId FROM academs WHERE userId=?")
        .get(member.id);

    if (exists) return;

    db.prepare(`
        INSERT INTO academs (userId, nickname, joinDate)
        VALUES (?, ?, ?)
    `).run(member.id, member.user.username, today());
}

function getUser(id) {
    return db.prepare("SELECT * FROM academs WHERE userId=?").get(id);
}

function getAll() {
    return db.prepare("SELECT * FROM academs").all();
}

// ================= ROLE TRACKING =================

client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
    const hadRole = oldMember.roles.cache.has(ACADEMS_ROLE_ID);
    const hasRole = newMember.roles.cache.has(ACADEMS_ROLE_ID);

    // Добавили роль Academs
    if (!hadRole && hasRole) {
        createUser(newMember);
        console.log(`➕ Added: ${newMember.user.username}`);
    }

    // Убрали роль Academs
    if (hadRole && !hasRole) {
        db.prepare("DELETE FROM academs WHERE userId=?")
            .run(newMember.id);

        console.log(`➖ Removed: ${newMember.user.username}`);
    }
});

// ================= SLASH COMMANDS =================

const commands = [
    new SlashCommandBuilder()
        .setName("academ-info")
        .setDescription("Информация об игроке")
        .addUserOption(o =>
            o.setName("user")
                .setDescription("Игрок")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("academ-list")
        .setDescription("Список всех Academs"),

    new SlashCommandBuilder()
        .setName("academ-edit")
        .setDescription("Изменить данные игрока")
        .addUserOption(o =>
            o.setName("user")
                .setDescription("Игрок")
                .setRequired(true)
        )
        .addStringOption(o =>
            o.setName("field")
                .setDescription("Поле (hours, warnings, violations, note, status)")
                .setRequired(true)
        )
        .addStringOption(o =>
            o.setName("value")
                .setDescription("Значение (+1 или текст)")
                .setRequired(true)
        )
].map(c => c.toJSON());

// ================= REGISTER COMMANDS =================

const rest = new REST({ version: "10" }).setToken(TOKEN);

client.once(Events.ClientReady, async () => {
    console.log(`🤖 Bot started as ${client.user.tag}`);

    try {
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, GUILD_ID),
            { body: commands }
        );

        console.log("✅ Slash commands registered");
    } catch (err) {
        console.error(err);
    }
});

// ================= COMMAND HANDLER =================

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // ================= INFO =================
    if (commandName === "academ-info") {
        const user = interaction.options.getUser("user");
        const data = getUser(user.id);

        if (!data) {
            return interaction.reply("❌ Нет данных");
        }

        const embed = new EmbedBuilder()
            .setTitle(`👤 ${data.nickname}`)
            .setColor("Green")
            .addFields(
                { name: "📅 Дата", value: data.joinDate, inline: true },
                { name: "⛏️ Часы", value: String(data.hours), inline: true },
                { name: "⚠️ Варны", value: String(data.warnings), inline: true },
                { name: "🚫 Нарушения", value: String(data.violations), inline: true },
                { name: "📈 Статус", value: data.status, inline: true },
                { name: "📝 Примечание", value: data.note || "Нет" }
            );

        return interaction.reply({ embeds: [embed] });
    }

    // ================= LIST =================
    if (commandName === "academ-list") {
        const list = getAll();

        if (!list.length) {
            return interaction.reply("❌ Пусто");
        }

        const text = list
            .map(u => `👤 ${u.nickname} | ⛏️ ${u.hours}ч | ⚠️ ${u.warnings}`)
            .join("\n");

        return interaction.reply({
            content: "📋 Academs:\n\n" + text
        });
    }

    // ================= EDIT =================
    if (commandName === "academ-edit") {
        const user = interaction.options.getUser("user");
        const field = interaction.options.getString("field");
        const value = interaction.options.getString("value");

        const allowed = ["hours", "warnings", "violations", "note", "status"];

        if (!allowed.includes(field)) {
            return interaction.reply("❌ Неверное поле");
        }

        const data = getUser(user.id);
        if (!data) {
            return interaction.reply("❌ Нет игрока");
        }

        if (field === "hours" || field === "warnings" || field === "violations") {
            const newValue = field === "hours"
                ? data.hours + parseInt(value)
                : field === "warnings"
                    ? data.warnings + parseInt(value)
                    : data.violations + parseInt(value);

            db.prepare(`UPDATE academs SET ${field}=? WHERE userId=?`)
                .run(newValue, user.id);
        } else {
            db.prepare(`UPDATE academs SET ${field}=? WHERE userId=?`)
                .run(value, user.id);
        }

        return interaction.reply(`✅ Обновлено ${field} для ${data.nickname}`);
    }
});

// ================= SAFE GUARD (ADMIN CHECK) =================

function isAdmin(member) {
    return member.permissions.has("Administrator");
}

// ================= FIX: ROLE UPDATE SAFETY =================

client.on(Events.Error, (err) => {
    console.error("❌ Bot error:", err);
});

// ================= CLEAN LOG START =================

console.log("📦 Academs Bot loading...");

// ================= OPTIONAL: AUTO FIX MISSING USERS =================

// если кто-то есть с ролью, но нет в базе
client.once(Events.ClientReady, async () => {
    const guild = await client.guilds.fetch(GUILD_ID);

    const members = await guild.members.fetch();

    members.forEach(m => {
        if (m.roles.cache.has(ACADEMS_ROLE_ID)) {
            createUser(m);
        }
    });

    console.log("🔄 Sync completed");
});

// ================= PROTECT EDIT COMMAND =================

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName !== "academ-edit") return;

    if (!isAdmin(interaction.member)) {
        return interaction.reply({
            content: "❌ Нет прав (только админ)",
            ephemeral: true
        });
    }
});

// ================= START BOT =================

client.login(MTUyMDgzMjU4NDc2MDk1MDg4Ng.G4pvKu.Muy9sKUkZQsrKUzxeTNKgx1d8NNYRxHLEOiSCQ);
client.login(TOKEN);
