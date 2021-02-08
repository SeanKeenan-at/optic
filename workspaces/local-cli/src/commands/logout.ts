import { Command } from '@oclif/command';
import { deleteCredentials } from '../shared/authentication-server';
import colors from 'colors';

export default class Logout extends Command {
  static description = 'Logout from Optic';
  static hidden = true;
  async run() {
    try {
      await deleteCredentials();
      this.log(
        `Done! You have been logged out. Run ${colors.bold(
          'api login'
        )} to authenticate`
      );
    } catch (e) {
      this.error(e);
    }
  }
}
