import { Controller, Get, Param, StreamableFile } from '@nestjs/common';
import { InspectionStore } from './inspection.store';

@Controller('api/drive')
export class DrivePhotoController {
  constructor(private readonly store: InspectionStore) {}

  @Get(':fileId')
  async getPhoto(@Param('fileId') fileId: string): Promise<StreamableFile> {
    const photo = await this.store.getDrivePhoto(fileId);
    return new StreamableFile(Buffer.from(photo.base64, 'base64'), { type: photo.mimeType });
  }
}
