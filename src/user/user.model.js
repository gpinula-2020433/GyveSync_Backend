import { Schema, model } from "mongoose";

const userSchema = Schema(
    {
        name:{
            type: String,
            required:[true, 'Name is required'],
            maxLength: [25, `Can't be overcome 25 characters`]
        },
        surname:{
            type: String,
            required:[true, 'Surname is required'],
            maxLength: [25, `Can't be overcome 25 characters`]
        },
        username:{
            type: String,
            required:[true, 'Surname is required'],
            unique : [true, 'Username is alredy taken'],
            lowercase: true,
            maxLength: [15, `Can't be overcome 15 characters`]
        },
        email:{
            type: String,
            required: [true, 'Email is required'],
            unique: true
        },
        password:{
            type:String,
            required: [true, 'Password is required'],
            minLength: [8, 'Password must be 8 characters'],
            maxLength: [100, `Can't be overcome 100 characters`],
        },
        imageUser: {
            type: String,
            default: null
        },
        hasInstitution: {
            type: Boolean,
            default: false
        },
        institutionId: {
            type: Schema.Types.ObjectId,
            ref: 'Institution',
            default: null
        },
        role:{
            type: String,
            uppercase: true,
            enum: ['ADMIN', 'CLIENT']
        }
    },
    {
        versionKey: false,
        timestamps: true
    }
)

userSchema.methods.toJSON = function(){
    const {__v, password, ...user} = this.toObject()
    return user
}

export default model ('User', userSchema)