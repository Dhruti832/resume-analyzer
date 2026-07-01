const { CognitoIdentityProviderClient, AdminAddUserToGroupCommand } = require("@aws-sdk/client-cognito-identity-provider");

const cognito = new CognitoIdentityProviderClient({});

exports.handler = async (event) => {
  if (event.triggerSource === "PostConfirmation_ConfirmSignUp") {
    // Role passed from the frontend via ClientMetadata during SignUp
    const role = event.request?.clientMetadata?.role || "student";
    const group = role === "recruiter" ? "recruiters" : "students";
    await cognito.send(new AdminAddUserToGroupCommand({
      UserPoolId: event.userPoolId,
      Username: event.userName,
      GroupName: group,
    }));
  }
  return event;
};
