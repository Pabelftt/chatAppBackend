import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },
    profileImageUrl: {
      type: String,
      default: null,
      maxlength: 2048
    },
    usernameSearch: {
      type: String,
      select: false
    },
    displayNameSearch: {
      type: String,
      select: false
    },
    fcmTokens: {
      type: [String],
      default: [],
      select: false
    },
    passwordHash: {
      type: String,
      required: true,
      select: false
    }
  },
  { timestamps: true }
);

userSchema.index({ usernameSearch: 1 });
userSchema.index({ displayNameSearch: 1 });
userSchema.index({ fcmTokens: 1 });
userSchema.pre('validate', function updateSearchFields() {
  if (this.username !== undefined) {
    this.usernameSearch = this.username.toLowerCase();
  }
  if (this.displayName !== undefined) {
    this.displayNameSearch = this.displayName.trim().toLowerCase();
  }
});

export const User = mongoose.model('User', userSchema);
