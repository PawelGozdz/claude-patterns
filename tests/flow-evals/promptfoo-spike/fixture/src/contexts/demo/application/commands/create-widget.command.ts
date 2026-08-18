export class CreateWidgetCommand {
  constructor(
    public readonly name: string,
    public readonly userId: string,
  ) {}
}
