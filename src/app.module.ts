import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { CatalogController } from './catalog.controller';
import { InspectionsController } from './inspections.controller';
import { InspectionStore } from './inspection.store';
import { HomeController } from './home.controller';
import { OperationsController } from './operations.controller';
import { GoogleWebAppClient } from './google-web-app.client';
import { ApiFallbackController } from './api-fallback.controller';
import { DrivePhotoController } from './drive-photo.controller';
import { PromptsController } from './prompts.controller';
import { GeminiResultStore } from './gemini-result.store';
import { EvidenceController } from './evidence.controller';
import { EvidenceStore } from './evidence.store';
import { NotebookLMClient } from './notebooklm.client';

@Module({
  controllers: [AuthController, CatalogController, InspectionsController, HomeController, OperationsController, DrivePhotoController, PromptsController, EvidenceController, ApiFallbackController],
  providers: [InspectionStore, GoogleWebAppClient, GeminiResultStore, EvidenceStore, NotebookLMClient],
})
export class AppModule {}