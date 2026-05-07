import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const db = config.get('database');

        return {
          ...db,
          autoLoadEntities: true,
          // Use compiled JS migrations from dist to avoid Node ESM/CJS import issues in dev runtime.
          migrations: [
            join(process.cwd(), 'dist', 'src', 'migrations', '*.js'),
          ],
          migrationsRun: true,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
