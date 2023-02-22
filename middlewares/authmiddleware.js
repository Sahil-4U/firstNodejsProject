const isAuth=(req,res,next)=>{
    if(req.session.isAuth){
        next()
    }else{
        return res.send({
            status:401,
            message:"You are not eligible",
        })
    }
}
const isValid=(req,res,next)=>{
    const id=req.body.id;
    const newData=req.body.newData;
    if(!id || !newData){
        return res.send({
            status:400,
            message:"invalid credentials",
        })
    }
    if(typeof newData!=="string"){
        return res.send({
            status:400,
            message:"invalid todo format",
        })
    }
    if (newData.length < 3 || newData.length > 50) {
        return res.send({
          status: 400,
          message: "Length of a todo should be in the range 3-50 charachters",
        });
      }
      next();
}
module.exports={isAuth,isValid};