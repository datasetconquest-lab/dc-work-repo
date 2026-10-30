import mongoose, { Schema, Document } from 'mongoose';

export interface IServerIpConfig extends Document {
  ip: string;          // IP, CIDR, or wildcard (e.g. 49.37.12.98, 157.48.0.0/16)
  label?: string;      // Description e.g. "Manager Home Airtel", "WFH User"
  added_by?: mongoose.Types.ObjectId;
  created_at: Date;
}

const ServerIpConfigSchema = new Schema<IServerIpConfig>({
  ip: { type: String, required: true, unique: true, trim: true },
  label: { type: String, trim: true, default: '' },
  added_by: { type: Schema.Types.ObjectId, ref: 'User' },
  created_at: { type: Date, default: Date.now }
}, {
  collection: 'server_ip_configs'
});

export const ServerIpConfig = mongoose.model<IServerIpConfig>('ServerIpConfig', ServerIpConfigSchema);

