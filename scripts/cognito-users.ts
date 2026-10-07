import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { DEMO_USERS } from '@bfp/domain';

/**
 * Creates the demo users (Mariana Souza, Rafael Lima, Camila Rocha) in the Cognito user pool,
 * with name, team and role group. The password is never stored in the repository.
 *
 * Required env: AWS_REGION, COGNITO_USER_POOL_ID, DEMO_USER_PASSWORD (min. 12 chars,
 * upper/lower/digit).
 */
async function main() {
  const region = process.env.AWS_REGION;
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const password = process.env.DEMO_USER_PASSWORD;
  if (!region || !userPoolId || !password) {
    throw new Error('Defina AWS_REGION, COGNITO_USER_POOL_ID e DEMO_USER_PASSWORD.');
  }

  const client = new CognitoIdentityProviderClient({ region });
  for (const user of DEMO_USERS) {
    const exists = await client
      .send(new AdminGetUserCommand({ UserPoolId: userPoolId, Username: user.email }))
      .then(() => true)
      .catch(() => false);

    if (!exists) {
      await client.send(
        new AdminCreateUserCommand({
          UserPoolId: userPoolId,
          Username: user.email,
          MessageAction: 'SUPPRESS',
          UserAttributes: [
            { Name: 'email', Value: user.email },
            { Name: 'email_verified', Value: 'true' },
            { Name: 'name', Value: user.name },
            { Name: 'custom:team', Value: user.team },
          ],
        }),
      );
    }

    await client.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: user.email,
        Password: password,
        Permanent: true,
      }),
    );
    await client.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: user.email,
        GroupName: user.role,
      }),
    );
    console.log(`${user.name} <${user.email}> → grupo ${user.role}`);
  }
}

await main();
