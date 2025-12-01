import mongoose, { Schema, Document, HydratedDocument, Model } from "mongoose";
import bcrypt from "bcryptjs";

export interface IUserMethod {
  comparePassword(inputPassword: string): Promise<boolean>;
  checkStorageQuota(fileSize: number): boolean;
}

export interface IAvatar {
  publicId: string;
  thumbnailId: string;
  url: string; // TODO: 这个东西要不要删掉？貌似没有用
  thumbnail: string;
  createdAt: Date;
}

export interface IUser extends Document, IUserMethod {
  email: string;
  password: string;
  name: string;
  avatar: IAvatar;
  storageUsage: number;
  storageQuota: number;
  createdAt: Date;
  updatedAt: Date;
}

export type UserModel = Model<IUser, {}, IUserMethod>;

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
      index: true,
    },

    password: {
      type: String,
      required: [true, "Password is required"],
      select: false,
    },

    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minLength: 2,
      maxLength: 50,
    },

    avatar: {
      publicId: {
        type: String,
        default: null,
      },
      thumbnailId: {
        type: String,
        default: null,
      },
      url: {
        type: String,
        default: null,
      },
      thumbnail: {
        type: String,
        default: null,
      },
    },

    storageUsage: {
      type: Number,
      default: 0,
      min: 0,
    },

    storageQuota: {
      type: Number,
      default: 5 * 1024 * 1024 * 1024, // 5GB
      min: 0,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc: HydratedDocument<IUser>, ret: any) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.password;
        return ret;
      },
    },
  }
);

userSchema.set("autoIndex", false);

// userSchema.index({ email: 1 });

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function (
  inputPassword: string
): Promise<boolean> {
  return await bcrypt.compare(inputPassword, this.password);
};

userSchema.methods.checkStorageQuota = function (fileSize: number): boolean {
  return this.storageUsage + fileSize <= this.storageQuota;
};

const User = mongoose.model<IUser, UserModel>("User", userSchema);
export default User;
