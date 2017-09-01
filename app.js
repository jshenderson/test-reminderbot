var builder = require('botbuilder');
var restify = require('restify');

//Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
    console.log('%s listening to %s', server.name, server.url);
});

//Create chat bot
var connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID, 
    appPassword: process.env.MICROSOFT_APP_PASSWORD 
});

var bot = new builder.UniversalBot(connector);
server.post('/api/messages', connector.listen());
server.get('/', restify.serveStatic({
    directory: __dirname,
    default: '/index.html'
}));

//Create bot and bind to console
//var connector = new builder.ConsoleConnector().listen();
//var bot = new builder.UniversalBot(connector);



//create LUIS recognizer that points at our model and add it as the root '/' dialog for our bot.

var model = "https://westus.api.cognitive.microsoft.com/luis/v2.0/apps/aceff1a0-173c-4f7e-a33a-aa013bffb7f1?subscription-key=387e4d67089944cfaccfd2dc6bde790e&timezoneOffset=-360&verbose=true&spellCheck=true&q="
var recognizer = new builder.LuisRecognizer(model);
var dialog = new builder.IntentDialog({ recognizers: [recognizer]});
bot.dialog('/', dialog);

//Add Intent handlers
    //dialog.matches('Reminder.Create', builder.DialogAction.send('Creating Reminder'));
    //dialog.matches('Reminder.Delete', builder.DialogAction.send('Deleting Reminder'));
    //dialog.onDefault(builder.DialogAction.send("I'm sorry I didn't understand. I can only create & delete alarms."));

dialog.matches('Reminder.Create', [
    function (session, args, next){
        //resolve and store any entities passed from LUIS
        var title = builder.EntityRecognizer.findEntity(args.entities, 'Reminder.Title');
        var time = builder.EntityRecognizer.resolveTime(args.entities);
        var reminder = session.dialogData.reminder = {
            title:title ? title.entity : null,
            timestamp: time ? time.getTime(): null
        };
        
        //Prompt For Title
        if(!reminder.title){
            builder.Prompts.text(session, 'What would you like to call you reminder?');
        }else {
            next();
            }
    },

    function (session, results, next){
        var reminder = session.dialogData.reminder;
        if (results.response){
            reminder.title = results.response;
        }

        //Prompt for time (title will be blank if the user said cancel)
        if (reminder.title && !reminder.timestamp){
            builder.Prompts.time(session, 'What time would you like to set the reminder for?');
        }else{
            next();
        }
    },
    function (session, results){
        var reminder = session.dialogData.reminder;
        if (results.response){
            var time = builder.EntityRecognizer.resolveTime([results.response]);
            reminder.timestamp = time ? time.getTime() : null;
        }

        //Set the reminder (if title or timestamp is blank the user said cancel)
        if (reminder.title && reminder.timestamp){
            //Save Address of who to notify and write to scheduler
            reminder.address = session.message.address;
            reminders[reminder.title] = reminder;

            //Send confirmation to user
            var date = new Date(reminder.timestamp);
            var isAM = date.getHours()<12;
            session.send('Creating reminder named "%s" for %d%d%d %d:%02d%s', reminder.title, date.getMonth() + 1, date.getDate(), date.getFullYear(), isAM ? date.getHours() : date.getHours()-12, date.getMinutes(),isAM ? 'am': 'pm');

        }else{
            session.send('Ok...no problem.');
        }
    }
]);    

dialog.matches('Reminder.Delete', [
    function(session, args, next){
        //Resolve entities passed from LUIS
        var title;
        var entity = builder.EntityRecognizer.findEntity(args.entities, 'Reminder.Title');
        if(entity){
            //verify its in our set of reminders
            title = builder.EntityRecognizer.findBestMatch(reminders, entity.entity);
        }
        //Prompt for Reminder Name
        if(!title){
            builder.Prompts.choice(session, 'Which reminder would you like to delete?', reminders);
        }else{
            next({ response: title});
        }
    },

    function (session, results){
        //If response is null the user canceled the task
        if (results.response){
            delete reminders[results.response.entity];
            session.send("Deleted the '%s' reminder.", results.response.entity);
        }else{
            session.send('Ok... no problem.');
        }
    }
]);

dialog.onDefault(builder.DialogAction.send("I'm sorry I didn't understand. I can only create & delete reminders."));

//Very simple reminder scheduler
var reminders = {};
setInterval(function(){
    var now = new Date().getTime();
    for (var key in reminders){
        var reminder = reminders[key];
        if(now >= reminder.timestamp){
            var msg = new builder.Message()
            .address(reminder.address)
            .text("Here's your '%s' reminder.", reminder.title);
            bot.send(msg);
            delete reminders[key];
        }
    }
}, 15000);