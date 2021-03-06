//const Ssentry = require("@sentry/node");
////const Ttracing = require("@sentry/tracing");


const Discord = require('discord.js');
const moment  = require("moment");
const axios = require("axios");

const fs = require('fs');
const ms = require("ms");

const mongoose = require('mongoose')
require("./extensions/ExtendedMessage");

const  User = require('./database/schemas/User')
const  Guild = require('./database/schemas/Guild')

const Reminder = require('./database/schemas/Reminder');

const client = new Discord.Client({partials: ["MESSAGE","REACTION"], ws: { intents: Discord.Intents.ALL } });



require('dotenv').config();

let config = require("./jsonFiles/config.json");

config.token = process.env.TOKEN
config.dbpath = process.env.DBPATH
config.OLDDBPATH = process.env.OLDDBPATH
if(process.env.prefix){
    config.prefix = process.env.PREFIX;
}
config.igniteapi = process.env.IGNITEAPI;

client.config = config;
const rawdata = fs.readFileSync(__dirname + '/jsonFiles/emojis.json');
const emoji_data = JSON.parse(rawdata);
client.emoji_data = emoji_data;
client.xpcooldown = {
    col: new Discord.Collection(),
    time: 15000

}
client.cachedMessageReactions = new Map();







/*Sentry.init({
    dsn: process.env.SENTRY,
    integrations: [
        new Tracing.Integrations.Mongo(),
    ],
    environment: process.env.ENV || 'Unknown',
    debug: true,
    tracesSampleRate: 1.0,
});*/




mongoose.connect(client.config.dbpath, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})






let loadEvents = function(){
    return new Promise((resolve, reject) =>{
        console.log('Loading events')
        fs.readdir("./events/", (err, files) => {
            if (err) return console.error(err);
            let discordEvents = Discord.Constants.Events;
            files.forEach(file => {
                const event = require(`./events/${file}`);
                //let eventName = file.split(".")[0];
                if(Object.keys(discordEvents).includes(event.conf.event.toUpperCase()) || Object.values(discordEvents).includes(event.conf.event))
                    client.on(event.conf.event, event.event.bind(null, client));
                else{
                    console.log('--------------------'+event.conf.event)
                    client.ws.on(event.conf.event, event.event.bind(null, client));
                }
                if(files.indexOf(file) == files.length-1){
                    resolve()
                }
            });
        });
    });
}

//client.commands = new Enmap();

client.commandFiles = new Discord.Collection();
client.commands = new Discord.Collection();
client.interactions = new Discord.Collection();
client.aliases = new Discord.Collection();



client.bypass = false;
client.master = client.config.master






let loadCommand = function(user, discordSlashCommands){
    return new Promise((resolve, reject) =>{
        // Loads all the subcategories inside the commands dir
        console.log('Loading commands');
        fs.readdir("./commands/", (direrr, dirs) =>{
            console.log('BUHBUHBUBH')
            

            if (direrr) {
                return console.log('Unable to scan directory: ' + err);
            }
            console.log(dirs)

            client.setInteractions = [];

            // Cycles thru all sub direcoties
            
            dirs.forEach((dir) => {
                // Make a path to that subdir
                const path = "./commands/"+dir+"/";
                // Read the contents of that subdir
                fs.readdir(path, (err, files) => {
                    if (err) return console.error(err);
                    // Go thru all files in the subdir
                    files.forEach((file) => {
                        // Check if they end with .js
                        if (!file.endsWith(".js")) return;
                        // Load the command file
                        let command_file = require(path+file);

                        // Set the command file with the file path
                        console.log(`Loading Command: ${command_file.help.name}`);
                        client.commandFiles.set(path+file, command_file);

                        // Check if the file has a message command for it
                        if( typeof command_file.run == 'function') {
                            client.commands.set(command_file.help.name, path+file);
                            command_file.conf.aliases.forEach(alias => {
                                client.aliases.set(alias, command_file.help.name);
                            });
                        }

                        // Check if the file has an interaction for it
                        if( typeof command_file.interaction == 'function') {
                            
                            let interaction = command_file.conf.interaction;
                            interaction.name = interaction.name || command_file.help.name
                            interaction.description = interaction.description || command_file.help.description

                            console.log(`Loading Interaction: ${interaction.name}`);
                            client.setInteractions.push(interaction.name)

                            if(!discordSlashCommands.find(slashCommand => {
                                slashCommand.name === interaction.name &&
                                slashCommand.description === interaction.name &&
                                slashCommand.options === interaction.options
                            })){
                                axios.post(`https://discordapp.com/api/applications/${user.id}/commands`, interaction, {headers:{'Authorization': `Bot ${client.config.token}`}})
                                //client.api.applications(user.id).commands.post({data: interaction})
                                console.log(`Updated Interaction: ${interaction.name}`)
                            }

                            client.interactions.set(interaction.name, path+file)
                        }

                        if(files.indexOf(file) == files.length-1 && dirs.indexOf(dir) == dirs.length-1){
                            resolve()
                        }

                    });
                });

            })
            
            
        })
    });
}

/*let loadAutoCommands = async function(){
    return new Promise((resolve, reject) =>{
        console.log('Loading autocommands');
        fs.readdir("./auto_commands/", (direrr, dirs) =>{
            if (direrr) {
                return console.log('Unable to scan directory: ' + err);
            }
            console.log(dirs)
            
            dirs.forEach(dir => {
                const path = `./auto_commands/${dir}/`;
                fs.readdir(path, (err, files) => {
                    if (err) return console.error(err);
                    files.forEach(file => {
                        if (!file.endsWith(".js")) return;
                    
                        let props = require(path+file);
                        console.log(`Loading auto_commands: ${props.help.name}`);
                        client.auto_commands.set(props.help.name, props);

                        props.conf.activations.forEach(alias => {
                            client.auto_activations.set(alias, props.help.name);
                        });
                        if(files.indexOf(file) == files.length-1 && dirs.indexOf(dir) == dirs.length-1){
                            resolve()
                        }
                    });
                });

            })
        })
    })
}*/

let reminderInterval = setInterval(async function () {
    let time = Date.now();
    let reminders = await Reminder.find();
    let to_be_reminded = reminders.filter(reminder => {return reminder.timelenght + reminder.timeStamp <= time});
    if(to_be_reminded.length > 0){
        to_be_reminded.forEach( async (reminder) =>{
            try{
                let user = client.users.cache.get(reminder.toMention);
                if(user){
                    let time_started = new Date(reminder.timeStamp);
                    let Embed = new Discord.MessageEmbed()
                        .setTitle('Reminder: '+reminder.message)
                        .setDescription(`On: ${time_started.toString()}
For: ${ms(reminder.timelenght)}
In: ${reminder.guildName}`);

                    user.send(Embed)
                }
            }catch(err){
                //Sentry.captureException(err);
                console.log(err)
                console.log('Error in reminder to user')
            }
        })
        let ids = to_be_reminded.map(function (el) { return el._id; })
        
        await Reminder.remove({_id: {$in: ids}})
    }        


},15*1000)



/*
    READY
    RESUMED
    GUILD_CREATE
    GUILD_DELETE
    GUILD_UPDATE
    INVITE_CREATE
    INVITE_DELETE
    GUILD_MEMBER_ADD
    GUILD_MEMBER_REMOVE
    GUILD_MEMBER_UPDATE
    GUILD_MEMBERS_CHUNK
    GUILD_INTEGRATIONS_UPDATE
    GUILD_ROLE_CREATE
    GUILD_ROLE_DELETE
    GUILD_ROLE_UPDATE
    GUILD_BAN_ADD
    GUILD_BAN_REMOVE
    GUILD_EMOJIS_UPDATE
    CHANNEL_CREATE
    CHANNEL_DELETE
    CHANNEL_UPDATE
    CHANNEL_PINS_UPDATE
    MESSAGE_CREATE
    MESSAGE_DELETE
    MESSAGE_UPDATE
    MESSAGE_DELETE_BULK
    MESSAGE_REACTION_ADD
    MESSAGE_REACTION_REMOVE
    MESSAGE_REACTION_REMOVE_ALL
    MESSAGE_REACTION_REMOVE_EMOJI
    USER_UPDATE
    PRESENCE_UPDATE
    TYPING_START
    VOICE_STATE_UPDATE
    VOICE_SERVER_UPDATE
    WEBHOOKS_UPDATE



MISC
    INVITE_CREATE
    WEBHOOKS_UPDATE

SERVER
    GUILD_UPDATE
    GUILD_EMOJIS_UPDATE

ROLES
    GUILD_ROLE_CREATE
    GUILD_ROLE_DELETE
    GUILD_ROLE_UPDATE

CHANNEL
    CHANNEL_CREATE
    CHANNEL_DELETE
    CHANNEL_UPDATE

MESSAGE
    MESSAGE_DELETE
    MESSAGE_UPDATE
    MESSAGE_DELETE_BULK

MEMBERS
    GUILD_MEMBER_ADD
    GUILD_MEMBER_REMOVE
    GUILD_MEMBER_UPDATE //add role and stuff

BANS
    GUILD_BAN_ADD
    GUILD_BAN_REMOVE
*/


const events = {
    misc:[      'INVITE_CREATE',
                'WEBHOOKS_UPDATE'],

    server:[    'GUILD_UPDATE',
                'GUILD_EMOJIS_UPDATE'],

    role:[      'GUILD_ROLE_CREATE',
                'GUILD_ROLE_DELETE',
                'GUILD_ROLE_UPDATE'],

    channel:[   'CHANNEL_CREATE',
                'CHANNEL_DELETE',
                'CHANNEL_UPDATE'],

    message:[   'MESSAGE_DELETE',
                'MESSAGE_UPDATE',
                'MESSAGE_DELETE_BULK'],

    member:[    'GUILD_MEMBER_ADD',
                'GUILD_MEMBER_REMOVE',
                'GUILD_MEMBER_UPDATE'],

    ban:[       'GUILD_BAN_ADD',
                'GUILD_BAN_REMOVE']
}

client.on('WEBHOOKS_UPDATE', async function(channel){
    const TEXT = "Webhook updated"


    const guild = channel.guild;

    const DbGuild = await Guild.findOne({id: guild.id});
    const db_guild = DbGuild;

    if(!db_guild) return;
    if(!db_guild.logging) return;
    if(!db_guild.logging.webhook.id) return;
    
    
    
    if(!db_guild.logging){
        const locate = "logging";
        const value = {$set: {[locate]:{}}};
        client.updatedb({id:channel.guild.id}, value);
    } 
    else if(db_guild.logging.WEBHOOKS_UPDATE.id){
        const log = new Discord.WebhookClient(db_guild.logging.webhook.id, db_guild.logging.webhook.token);

        const embed = new Discord.MessageEmbed()
            .setTitle(TEXT)
            .setTimestamp()
            .setDescription(`Channel: ${message.channel.name}`);

        webhookClient.send('fishy-bot-logging', {
            username: 'FishyBot-log',
            avatarURL: client.user.displayAvatarURL(),
            embeds: [embed],
        });

    }

}.bind(null, client));

client.on('guildMemberUpdate', async function(oldMember, newMember) {
    const guild = oldMember.guild

    const DbGuild = await Guild.findOne({id: guild.id});
    const db_guild = DbGuild;

    if(!db_guild) return;
    if(!db_guild.logging) return;
    if(!db_guild.logging.webhook.id) return;
    
    const log = new Discord.WebhookClient(db_guild.logging.webhook.id, db_guild.logging.webhook.token);


    //var log = guild.channels.find('id', CHANNEL);

    //declare changes
    var Changes = {
        unknown: 0,
        addedRole: 1,
        removedRole: 2,
        username: 3,
        nickname: 4,
        avatar: 5
    };
    var change = Changes.unknown;

    //check if roles were removed
    var removedRole = '';
    oldMember.roles.cache.forEach(value => {
        if(newMember.roles.cache.find(value2 => value2.id== value.id) == null) {
            change = Changes.removedRole;
            removedRole = value.name;
        }
    });

    //check if roles were added
    var addedRole = '';
    newMember.roles.cache.forEach(value => {
        if(oldMember.roles.cache.find(value2 => value2.id== value.id) == null) {
            change = Changes.addedRole;
            addedRole = value.name;
        }
    });

    //check if username changed
    if(newMember.user.username != oldMember.user.username)
        change = Changes.username;

    //check if nickname changed
    if(newMember.nickname != oldMember.nickname)
        change = Changes.nickname;

    //check if avatar changed
    if(newMember.user.displayAvatarURL() != oldMember.user.displayAvatarURL())
        change = Changes.avatar;

    //post in the guild's log channel
    let embed = undefined;
    if (log != null) {
        switch(change) {
            case Changes.unknown:
                embed = new Discord.MessageEmbed()
                    .setAuthor(`${newMember.user.username}#${newMember.user.discriminator}`, newMember.user.displayAvatarURL())
                    .setTitle(`User updated`)
                    .setColor('#0099ff');


                //log.send('**[User Update]** ' + newMember);
                break;
            case Changes.addedRole:
                embed = new Discord.MessageEmbed()
                    .setAuthor(`${newMember.user.username}#${newMember.user.discriminator}`, newMember.user.displayAvatarURL())
                    .setTitle(`User role added`)
                    .setDescription(`<@${addedRole.id}>`)
                    .setColor('#00ff00');
                //log.send('**[User Role Added]** ' + newMember + ': ' + addedRole);
                break;
            case Changes.removedRole:
                embed = new Discord.MessageEmbed()
                    .setAuthor(`${newMember.user.username}#${newMember.user.discriminator}`, newMember.user.displayAvatarURL())
                    .setTitle(`User role removed`)
                    .setDescription(`<@${removedRole.id}>`)
                    .setColor('#ff0000');
                //log.send('**[User Role Removed]** ' + newMember + ': ' + removedRole);
                break;
            case Changes.username:
                embed = new Discord.MessageEmbed()
                    .setAuthor(`${newMember.user.username}#${newMember.user.discriminator}`, newMember.user.displayAvatarURL())
                    .setTitle(`User username changed`)
                    .addFields(
                        { name: 'Before: ', value: `${oldMember.user.username}#${oldMember.user.discriminator}`, inline: false },
                        { name: '+After: ', value: `${newMember.user.username}#${newMember.user.discriminator}`, inline: false },
                    )
                    .setColor('#0099ff');

                //log.send('**[User Username Changed]** ' + newMember + ': Username changed from ' +
                //    oldMember.user.username + '#' + oldMember.user.discriminator + ' to ' +
                //    newMember.user.username + '#' + newMember.user.discriminator);
                break;
            case Changes.nickname:
                embed = new Discord.MessageEmbed()
                    .setAuthor(`${newMember.user.username}#${newMember.user.discriminator}`, newMember.user.displayAvatarURL())
                    .setTitle(`User nickname changed`)
                    .addFields(
                        { name: 'Before: ', value: `${oldMember.nickname}`, inline: false },
                        { name: '+After: ', value: `${newMember.nickname}`, inline: false },
                    )
                    .setColor('#0099ff');
                //log.send('**[User Nickname Changed]** ' + newMember + ': ' +
                //    (oldMember.nickname != null ? 'Changed nickname from ' + oldMember.nickname +
                //        + newMember.nickname : 'Set nickname') + ' to ' +
                //    (newMember.nickname != null ? newMember.nickname + '.' : 'original username.'));
                break;
            case Changes.avatar:
                embed = new Discord.MessageEmbed()
                    .setAuthor(`${newMember.user.username}#${newMember.user.discriminator}`, newMember.user.displayAvatarURL())
                    .setTitle(`User avatar changed`)
                    //.setThumbnail('https://i.imgur.com/wSTFkRM.png')
                    .setColor('#0099ff');
                //log.send('**[User Avatar Changed]** ' + newMember);
                break;
        }
    }
    if(embed){
        embed.setTimestamp()
        log.send({
            username: 'FishyBot-log',
            avatarURL: client.user.displayAvatarURL(),
            embeds: [embed],
        });
    }
});





client.on('messageDelete', async function(message){
    const guild = message.guild



    const DbGuild = await Guild.findOne({id: guild.id});
    const db_guild = DbGuild;

    if(!db_guild) return;
    if(!db_guild.logging) return;
    if(!db_guild.logging.webhook.id) return;
    var embed;
    const log = new Discord.WebhookClient(db_guild.logging.webhook.id, db_guild.logging.webhook.token);
    if(log != null){
        embed = new Discord.MessageEmbed()
            .setAuthor(`${message.author.username}#${message.author.discriminator}`, message.author.displayAvatarURL())
            .setTitle(`Message deleted in #${message.channel.name}`)
            .setDescription(message.content)
            .setColor('#ff0000')
            .setTimestamp()
            .setFooter('AuthorID: '+message.author.id);
    }
    if(embed){
        log.send({
            username: 'FishyBot-log',
            avatarURL: client.user.displayAvatarURL(),
            embeds: [embed],
        });
    }
});


client.on('roleCreate', async function(role){

    const guild = role.guild
    const DbGuild = await Guild.findOne({id: guild.id});
    const db_guild = DbGuild;

    if(!db_guild) return;
    if(!db_guild.logging) return;
    if(!db_guild.logging.webhook.id) return;

    var embed;
    const log = new Discord.WebhookClient(db_guild.logging.webhook.id, db_guild.logging.webhook.token);
    if(log != null){
        embed = new Discord.MessageEmbed()
            //.setAuthor(`r`, message.author.displayAvatarURL())
            .setTitle(`Role created`)
            .setDescription(`${role.name}, <@&${role.id}>`)
            .setColor('#00ff00')
            .setTimestamp()
            .setFooter('ID: '+role.id);
    }
    if(embed){
        log.send({
            username: 'FishyBot-log',
            avatarURL: client.user.displayAvatarURL(),
            embeds: [embed],
        });
    }
});




client.on('roleDelete', async function(role){

    const guild = role.guild
    const DbGuild = await Guild.findOne({id: guild.id});
    const db_guild = DbGuild;

    if(!db_guild) return;
    if(!db_guild.logging) return;
    if(!db_guild.logging.webhook.id) return;

    var embed;
    const log = new Discord.WebhookClient(db_guild.logging.webhook.id, db_guild.logging.webhook.token);
    if(log != null){
        embed = new Discord.MessageEmbed()
            //.setAuthor(`r`, message.author.displayAvatarURL())
            .setTitle(`Role deleted`)
            .setDescription(`${role.name}, <@&${role.id}>`)
            .setColor('#ff0000')
            .setTimestamp()
            .setFooter('ID: '+role.id);
    }
    if(embed){
        log.send({
            username: 'FishyBot-log',
            avatarURL: client.user.displayAvatarURL(),
            embeds: [embed],
        });
    }
});
console.log('Done with logging');
events.misc
events.server
events.role
events.channel
events.message
events.member
events.ban







const dbtools = require("./utils/dbtools");

client.getDbGuild = dbtools.getDbGuild;
client.updatedb = dbtools.updatedb;
client.getDbUser = dbtools.getDbUser;

//client.elevation = dbtests.elevation;
client.allow_test = dbtools.allow_test;


const other = require("./utils/other");
client.getMember = other.getMember;


client.sendinfo = function (info){
    try{
        if(client.config.infochannel){
            client.channels.cache.get(client.config.infochannel).send(info);
        }
    }catch(err){
        console.log('Failed to send info to the info channel.\nMake sure the info channel is set correctly in the config file\nInfo: '+ info)
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
client.func = {}
client.func.sleep =sleep;
console.log('Logging on')




process.on('SIGTERM', async() => {
    client.sendinfo('SIGTERM signal received: stopping bot')
    clearInterval(reminderInterval)
    await sleep(100);
    await Promise.all([
        mongoose.connection.close(),
        client.destroy()
    ])
    process.exit()
})

process.on('SIGINT', async () => {
    client.sendinfo('SIGINT signal received: stopping bot');
    clearInterval(reminderInterval);
    await sleep(100);
    await Promise.all([
        mongoose.connection.close(),
        client.destroy()
    ])
    process.exit()
})

let login = async function(){
    let userdata = await axios.get('https://discordapp.com/api/users/@me', {headers:{'Authorization': `Bot ${client.config.token}`}})
    user = userdata.data
    let discordSlashCommands = await axios.get(`https://discordapp.com/api/applications/${user.id}/commands`, {headers:{'Authorization': `Bot ${client.config.token}`}})
    await Promise.all([
        loadCommand(user, discordSlashCommands.data),
        loadEvents()
    ])
    console.log('DONE')
    client.login(config.token);
}


try {
    login()
} catch (e) {
    //Sentry.captureException(e);
}
























/*
new Promise(async(resolve) =>{
    try{
        let cmdmsg = ["**All slash commands (use by typing /commandname)*"];
        let commands = await client.api.applications(user.id).commands.get();
        commands.forEach((command) => {
            cmdmsg.push(
`Name: **${command.name}**
Desc: \`${command.description}\`
Options: 
`)
            if(!command.options){
                return;
            }
            command.options.forEach(option =>{
                let extra = ""
                if(option.type == 2){
                    extra+='\n'
                    extra+=option.options.map(ExtraOption => `  *) (\`${ExtraOption.type}\`): \`${ExtraOption.name}\``).join('\n')+'\n'
                }
                cmdmsg[cmdmsg.length-1] = cmdmsg[cmdmsg.length-1] + (`(\`${option.type}\`): \`${option.name}\` ${extra}\n`)
                
                if(commands.indexOf(command) == commands.length-1 && command.options.indexOf(option) == command.options.length-1){
                    message.channel.send(cmdmsg.join('\n\n'))
                    resolve('^^')
                }
            })

        });
    }catch(err){
        resolve(err)
    }
});
*/
/*
new Promise(async(resolve) =>{
    try{
        let Discord = require('discord.js')
        let s = await message.channel.send('asdf');
        message.channel.send(s instanceof Discord.Message)
    }catch(err){
        resolve(err)
    }
});

*/