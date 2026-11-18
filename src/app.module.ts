import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { CatalogController } from './catalog.controller';
import { InspectionsController } from './inspections.controller';
import { InspectionStore } from './inspection.store';
import { HomeController } from './home.controller';
import { OperationsController } from './operations.controller';

@Module({
  controllers: [AuthController, CatalogController, InspectionsController, HomeController, OperationsController],
  providers: [InspectionStore],
})
export class AppModule {}