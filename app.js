//import of packages
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const app = express();
const clc = require('cli-color');
const validator = require('validator');
const { cleanUpAndValidate } = require('./Utils/AuthUtils');
const UserSchema = require('./UserSchema');
const session = require("express-session");
const { isAuth, isValid } = require('./middlewares/authmiddleware');
const mongodbSession = require('connect-mongodb-session')(session);
const TodoModles = require("./Models/TodoModles");
const rateLimiting = require('./middlewares/ratelimiting');
const ObjectId = require('mongoose').ObjectId;

//how to make our port dynamic
const PORT = process.env.PORT || 8002

app.set("view engine", "ejs");


//mongodb connection
mongoose.set('strictQuery', false);
const uri = 'mongodb+srv://Sahil:9992@cluster0.7dhdonx.mongodb.net/todoApp';
mongoose.connect(uri)
    .then(() => {
        console.log(clc.yellowBright("connected with mongodb"));
    })
    .catch((err) => {
        console.log(clc.red('kuch to gadbad h daya db m check kro ek bar'));
        console.log(clc.red(err));
    })
//middle-ware
app.use(express.json());
app.use(express.urlencoded({ extended: true }))
app.use(express.static("public"));//this middle-ware excess public folder files to clien and server side

//mongodb store
const store = new mongodbSession({
    uri: uri,
    collection: "sessions",
});
//now we need to create a session which is store in mongodb store
app.use(
    session({
        secret: "this is my todo APP",
        resave: false,
        saveUninitialized: false,
        store: store,
    })
);


const saltRound = 10;
//routes
app.get('/', (req, res) => {
    res.render('home');
})

app.get('/register', (req, res) => {
    res.render('register');
});

app.get('/login', (req, res) => {
    res.render('login');
});
//register route
app.post('/register', async (req, res) => {
    console.log(req.body);
    const { name, email, username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, saltRound);
    try {
        await cleanUpAndValidate({ name, email, username, password });

        let userExist;
        try {
            userExist = await UserSchema.findOne({ email })
        } catch (error) {
            res.send({
                status: 403,
                message: "database error",
                error: error
            })
        }
        if (userExist) {
            return res.send({
                status: 404,
                message: "user already exist"
            });
        }
        //mongoose connection
        const user = new UserSchema({
            name: name,
            email: email,
            username: username,
            password: hashedPassword
        })
        try {
            const datadb = await user.save();
            return res.status(200).redirect("/login");
        } catch (error) {
            return res.send({
                status: 402,
                error: error,
            })
        }
    } catch (err) {
        return res.send({
            status: 401,
            error: err,
        })
    }
})
//post request for login page
app.post("/login", async (req, res) => {
    console.log(req.body);
    const { loginId, password } = req.body;
    //validate our data is to be correct or not 
    if (!loginId || !password) {
        return res.send({
            status: 405,
            message: "missing credentials",
        })
    }
    if (typeof loginId !== "string" || typeof password !== "string") {
        return res.send({
            status: 400,
            message: "invalid credentials",
        })
    }
    //identifing the data is user send email or username
    try {
        let isUser;
        if (validator.isEmail('loginId')) {
            isUser = await UserSchema.findOne({ email: loginId });//left side pr schema key or right pr user ne jo send kiya h vo
        } else {
            isUser = await UserSchema.findOne({ username: loginId });
        }
        if (!isUser) {
            return res.send({
                status: 455,
                message: "user not exist"
            })
        }
        //validate the password
        const isMatch = await bcrypt.compare(password, isUser.password);
        if (!isMatch) {
            return res.send({
                status: 400,
                message: "password is not matched",
            })
        }
        //here we need to write session 
        req.session.isAuth = true;
        req.session.user = {
            username: isUser.username,
            email: isUser.email,
            userId: isUser._id,
        }
        return res.status(200).redirect("/dashboard")
    } catch (error) {
        return res.send({
            status: 400,
            message: "could not find data",
        })
    }
})
//new route for checking req.session
app.get('/dashboard', isAuth, async (req, res) => {
    // const username=req.session.user.username;//here we fetch username
    
    // let todos=[];
    // try{
    //     todos=await TodoModles.find({username:username});//here we find the data with username
    //     // console.log(username);
    //     // console.log(todos);
    // }catch(error){
    //     console.log(error);
    //     return res.send({
    //         status:400,
    //         message:"bad request",
    //         error:error
    //     })
    // }
    return res.render('dashboard');
});
//logout route
app.post("/logout", isAuth, (req, res) => {
    console.log(req.session);
    req.session.destroy((err) => {
        if (err) throw err;

        res.redirect("/login");
    })
});
//logout from all devices
app.post("/logout_from_all_devices", isAuth, async (req, res) => {
    const username = req.session.user.username;
    //create a schema
    const Schema = mongoose.Schema;
    const sessionSchema = new Schema({ _id: String }, { strict: false });
    const sessionModel = mongoose.model("session", sessionSchema);
    try {
        const sessiondbDeleteCount = await sessionModel.deleteMany({ "session.user.username": username });
        // console.log(sessiondbDeleteCount);
        return res.send({
            status: 200,
            message: "logout from all devices successfully"
        });
    } catch (error) {
        return res.send({
            status: 400,
            message: "logout unsuccessfull ",
            error: error
        });
    }
})
//post req to handle creat-todo
app.post("/create-item", isAuth,rateLimiting, async (req, res) => {
    const todotext = req.body.todo;
    const username = req.session.user.username;
    if (!todotext) {
        return res.send({
            status: 400,
            message: "missing credentials",
        })
    }
    if (typeof todotext !== 'string') {
        return res.send({
            status: 400,
            message: "invalid credentials",
        })
    }
    if (todotext.length < 3 || todotext.length > 50) {
        return res.send({
            status: 401,
            message: "todo must be in range 3-50"
        })
    }
    const tododb = new TodoModles({
        todo: todotext,
        username: username,
    });
    try {
        const todo = await tododb.save();
        // console.log(todo);
        return res.send({
            status: 200,
            message: "todo updated in db",
        });
    } catch (error) {
        return res.send({
            status: 400,
            message: error
        })
    }
})
//edit route
app.post("/edit-item", isAuth, isValid, async (req, res) => {
    console.log(req.body);
    const id = req.body.id;
    const newData = req.body.newData;
    //find the todo and match owner:--
    try {
        const todo = await TodoModles.findOne({ _id: id });
        if (!todo) {
            return res.send({
                status: 401,
                message: "todo not found ",
            })
        }
        //now check the owner is really owner or someone else:-
        if (todo.username !== req.session.user.username) {
            return res.send({
                status: 401,
                message: "authorization failed you are not the owner who are you",
            })
        }
        //if the compiler is here means owner hi  owner h or ab ap todo ko update kr skte ho
        const todoDb = await TodoModles.findOneAndUpdate({ _id: id }, { todo: newData })
        // console.log(todoDb);
        return res.send({
            status: 200,
            message: "todo updated successfully",
        })
    } catch (error) {
        console.log(error);
        return res.send({
            status: 400,
            message: "database error",
            error: error
        })
    }
});
//delete route
app.post("/delete-item", isAuth, async (req, res) => {
    const id = req.body.id;
    // console.log(req.body);
    // console.log(id);
    //validate id
    if (!id) {
        return res.send({
            status: 400,
            message: "missing credentials",
        })
    }
    //find the todo
    try {
        const todo = await TodoModles.findOne({ _id:id});
        // console.log(todo);
        if (!todo) {//edge case for if todo is null
            return res.send({
                status: 400,
                message: "todo is not found",
            })
        }
        //chect ownership
        if (todo.username !== req.session.user.username) {
            return res.send({
                status: 402,
                message: "invalid authorization"
            })
        }
        //now delete the todo
        const deleteTodo = await TodoModles.findOneAndDelete({ _id:id});
        console.log(deleteTodo);
        return res.send({
            status: 200,
            message: "todo is deleted now",
        })
    } catch (error) {
        console.log(error);
        return res.send({
            status: 403,
            message: "database error",
            error: error,
        })
    }
})
//pagination route
app.get("/pagination_dashboard",isAuth,async(req,res)=>{
    const skip=req.query.skip || 0;//we will get this from client side
    const LIMIT=3;//limit is backend engineer choice as much you need you can set it

    const username=req.session.user.username;

    //mongodb aggregate function
    //this is db call so we put it in try catch block
    try{
        const todos= await TodoModles.aggregate([
            {$match:{username:username}},
            {
                $facet:{
                    data:[{$skip:parseInt(skip)},{$limit:LIMIT}],
                },
            }
        ]);
        // console.log(todos[0].data);
        return res.send({
            status:200,
            message:"read successfull",
            data:todos
        })
    }catch(error){
        return res.send({
            status:400,
            message:"read Unsuccessfull",
            error:error
        })
    }
});
//start our port
app.listen(PORT, () => {
    console.log(clc.yellow("server is started"));
    console.log(clc.blue.underline(`http://localhost:${PORT}/`));
})