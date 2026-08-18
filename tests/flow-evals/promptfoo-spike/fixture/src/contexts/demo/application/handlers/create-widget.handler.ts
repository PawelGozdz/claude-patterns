import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Result } from '@vytches/ddd';
import { CreateWidgetCommand } from '../commands/create-widget.command';
import { Widget } from '../../domain/aggregates/widget.aggregate';
import { WidgetRepository } from '../../domain/repositories/widget.repository';

@CommandHandler(CreateWidgetCommand)
export class CreateWidgetHandler implements ICommandHandler<CreateWidgetCommand> {
  constructor(private readonly widgetRepository: WidgetRepository) {}

  async execute(command: CreateWidgetCommand): Promise<Result<void>> {
    const widgetOrError = Widget.create({ name: command.name, ownerId: command.userId });
    if (widgetOrError.isFailure()) return Result.fail(widgetOrError.error);

    await this.widgetRepository.save(widgetOrError.value);
    return Result.ok();
  }
}
